import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { transferDb, logDb } from '../db/database.js';
import compression from '../lib/compression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function serializeTransfer(t) {
  const savings =
    typeof t.space_saved_percent === 'number'
      ? t.space_saved_percent
      : Number((100 - (t.compression_ratio || 100)).toFixed(2));

  return {
    id: t.id,
    filename: t.original_filename,
    originalSize: compression.formatBytes(t.original_size),
    originalSizeBytes: t.original_size,
    compressedSize: compression.formatBytes(t.compressed_size),
    compressedSizeBytes: t.compressed_size,
    spaceSaved: compression.formatBytes(t.original_size - t.compressed_size),
    spaceSavedBytes: t.original_size - t.compressed_size,
    spaceSavedPercent: `${savings}%`,
    compressionRatio: `${t.compression_ratio}%`,
    algorithm: t.algorithm || 'gzip',
    hasPassword: !!t.password_hash,
    downloadCount: t.download_count,
    maxDownloads: t.max_downloads,
    expiresAt: t.expires_at,
    createdAt: t.created_at,
    status: t.status,
    mimeType: t.mime_type
  };
}

router.get('/stats/overview', (_req, res) => {
  try {
    transferDb.cleanupExpired();
    const transfers = transferDb.getAll(1000, 0, { includeInactive: true });

    const totalUploads = transfers.length;
    const totalOriginalSize = transfers.reduce(
      (sum, t) => sum + (t.original_size || 0),
      0
    );
    const totalCompressedSize = transfers.reduce(
      (sum, t) => sum + (t.compressed_size || 0),
      0
    );
    const totalDownloads = transfers.reduce(
      (sum, t) => sum + (t.download_count || 0),
      0
    );

    // Guard against non-finite ratios written by older versions, which would
    // otherwise turn the whole average into NaN/Infinity.
    const validRatios = transfers.filter((t) =>
      Number.isFinite(t.compression_ratio)
    );
    const avgSavings =
      validRatios.length > 0
        ? (
            validRatios.reduce(
              (sum, t) => sum + (100 - t.compression_ratio),
              0
            ) / validRatios.length
          ).toFixed(2)
        : '0.00';

    const active = transfers.filter((t) => t.status === 'active').length;

    res.json({
      totalUploads,
      activeTransfers: active,
      totalDownloads,
      totalOriginalSize: compression.formatBytes(totalOriginalSize),
      totalOriginalSizeBytes: totalOriginalSize,
      totalCompressedSize: compression.formatBytes(totalCompressedSize),
      totalCompressedSizeBytes: totalCompressedSize,
      totalSaved: compression.formatBytes(
        totalOriginalSize - totalCompressedSize
      ),
      totalSavedBytes: totalOriginalSize - totalCompressedSize,
      avgSavingsPercent: `${avgSavings}%`
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/', (req, res) => {
  try {
    const showInactive = req.query.includeInactive === 'true';
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    transferDb.cleanupExpired();

    const transfers = transferDb.getAll(limit, offset, {
      includeInactive: showInactive
    });

    res.json({
      transfers: transfers.map(serializeTransfer),
      // Size of the whole collection, not of this page — the client needs it
      // to know whether more pages exist.
      total: transferDb.count({ includeInactive: showInactive }),
      count: transfers.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('List transfers error:', error);
    res.status(500).json({ error: 'Failed to list transfers' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const transfer = transferDb.getById(id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const logs = logDb.getByTransferId(id);

    res.json({
      transfer: serializeTransfer(transfer),
      logs: logs.map((l) => ({
        action: l.action,
        timestamp: l.created_at,
        ipAddress: l.ip_address,
        details: l.details
          ? tryParseJson(l.details)
          : null
      }))
    });
  } catch (error) {
    console.error('Get transfer error:', error);
    res.status(500).json({ error: 'Failed to get transfer' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const transfer = transferDb.getById(id);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', transfer.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Could not remove file', filePath, err.message);
      }
    }

    transferDb.delete(id);

    logDb.create({
      transfer_id: id,
      action: 'deleted',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      details: null
    });

    res.json({ success: true, message: 'Transfer deleted' });
  } catch (error) {
    console.error('Delete transfer error:', error);
    res.status(500).json({ error: 'Failed to delete transfer' });
  }
});

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default router;
