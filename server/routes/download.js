import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

import { transferDb, logDb } from '../db/database.js';
import encryption from '../lib/encryption.js';
import compression from '../lib/compression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function encodeRfc5987(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}

function decompress(data, algorithm) {
  // 'none' means the uploader stored the payload verbatim because compressing
  // it would have made it larger.
  if (algorithm === compression.Algorithm.NONE) {
    return Promise.resolve(data);
  }
  if (algorithm === compression.Algorithm.BROTLI) {
    return compression.decompressBrotli(data);
  }
  return compression.decompressGzip(data);
}

router.get('/:id/info', (req, res) => {
  try {
    const { id } = req.params;
    const transfer = transferDb.getById(id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    if (
      transfer.expires_at &&
      new Date(transfer.expires_at) < new Date() &&
      transfer.status === 'active'
    ) {
      transferDb.updateStatus(id, 'expired');
      return res.status(410).json({ error: 'Transfer has expired' });
    }

    if (transfer.status !== 'active') {
      return res.status(410).json({ error: `Transfer is ${transfer.status}` });
    }

    if (
      transfer.max_downloads &&
      transfer.download_count >= transfer.max_downloads
    ) {
      return res.status(410).json({ error: 'Download limit reached' });
    }

    res.json({
      id: transfer.id,
      filename: transfer.original_filename,
      originalSize: compression.formatBytes(transfer.original_size),
      originalSizeBytes: transfer.original_size,
      compressedSize: compression.formatBytes(transfer.compressed_size),
      compressedSizeBytes: transfer.compressed_size,
      spaceSaved: compression.formatBytes(
        transfer.original_size - transfer.compressed_size
      ),
      spaceSavedBytes: transfer.original_size - transfer.compressed_size,
      spaceSavedPercent:
        typeof transfer.space_saved_percent === 'number'
          ? `${transfer.space_saved_percent}%`
          : `${(100 - (transfer.compression_ratio || 100)).toFixed(2)}%`,
      compressionRatio: `${transfer.compression_ratio}%`,
      algorithm: transfer.algorithm || 'gzip',
      hasPassword: !!transfer.password_hash,
      expiresAt: transfer.expires_at,
      downloadCount: transfer.download_count,
      maxDownloads: transfer.max_downloads,
      createdAt: transfer.created_at,
      mimeType: transfer.mime_type
    });
  } catch (error) {
    console.error('Get info error:', error);
    res.status(500).json({ error: 'Failed to get transfer info' });
  }
});

router.post('/:id', async (req, res) => {
  const io = req.app.get('io');
  const emit = (stage, progress) =>
    io.to(`transfer-${req.params.id}`).emit('download-progress', {
      transferId: req.params.id,
      stage,
      progress
    });

  try {
    const { id } = req.params;
    const { password, decryptionKey, authTag } = req.body;

    const transfer = transferDb.getById(id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    if (transfer.status !== 'active') {
      return res.status(410).json({ error: `Transfer is ${transfer.status}` });
    }

    if (transfer.expires_at && new Date(transfer.expires_at) < new Date()) {
      transferDb.updateStatus(id, 'expired');
      return res.status(410).json({ error: 'Transfer has expired' });
    }

    if (
      transfer.max_downloads &&
      transfer.download_count >= transfer.max_downloads
    ) {
      return res.status(410).json({ error: 'Download limit reached' });
    }

    if (transfer.password_hash) {
      if (!password) {
        return res
          .status(401)
          .json({ error: 'Password required', requiresPassword: true });
      }
      const isValid = await bcrypt.compare(password, transfer.password_hash);
      if (!isValid) {
        logDb.create({
          transfer_id: id,
          action: 'download_failed',
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          details: 'Invalid password'
        });
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    if (!decryptionKey || !authTag) {
      return res.status(400).json({
        error: 'Decryption key and auth tag required',
        message: 'These should be present in the download URL fragment'
      });
    }

    emit('reading', 10);

    const filePath = path.join(
      __dirname,
      '..',
      'uploads',
      transfer.filename
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    const encryptedData = fs.readFileSync(filePath);

    const checksum = encryption.generateChecksum(encryptedData);
    if (checksum !== transfer.checksum) {
      return res.status(500).json({ error: 'File integrity check failed' });
    }

    emit('decrypting', 40);

    let decryptedData;
    try {
      decryptedData = encryption.decrypt(
        encryptedData,
        decryptionKey,
        transfer.encryption_iv,
        authTag
      );
    } catch (decryptError) {
      console.error('Decryption error:', decryptError);
      return res.status(400).json({
        error: 'Decryption failed',
        message: 'Invalid decryption key or auth tag'
      });
    }

    emit('decompressing', 70);

    const decompressedData = await decompress(
      decryptedData,
      transfer.algorithm || compression.Algorithm.GZIP
    );

    transferDb.updateDownloadCount(id);

    logDb.create({
      transfer_id: id,
      action: 'download',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      details: JSON.stringify({ size: decompressedData.length })
    });

    emit('complete', 100);

    const asciiFallback = transfer.original_filename.replace(
      /[^\x20-\x7E]/g,
      '_'
    );
    const filenameStar = encodeRfc5987(transfer.original_filename);

    res.setHeader(
      'Content-Type',
      transfer.mime_type || 'application/octet-stream'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${filenameStar}`
    );
    res.setHeader('Content-Length', decompressedData.length);
    res.send(decompressedData);
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: 'Download failed', message: error.message });
    }
  }
});

export default router;
