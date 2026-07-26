import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

import { transferDb, logDb } from '../db/database.js';
import encryption from '../lib/encryption.js';
import compression from '../lib/compression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MAX_FILE_BYTES = 500 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'temp');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES }
});

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Cleanup failed for', filePath, err.message);
  }
}

// Busboy decodes multipart filenames as latin1, which mangles any non-ASCII
// name (e.g. "résumé.txt" -> "rÃ©sumÃ©.txt"). Re-interpret the bytes as UTF-8.
function decodeFilename(name) {
  if (!name) return 'file';
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

// The uploader cannot join the `transfer-<id>` room before it knows the id,
// and the id is only minted here. So progress is emitted both to the room
// (for observers that already know the id) and straight back to the socket
// that initiated the upload.
function makeEmitter(io, transferId, socketId) {
  const targets = [`transfer-${transferId}`];

  // socketId arrives from the client, and `to()` treats any string as a room
  // name — so accept it only if it really is a live socket, otherwise a caller
  // could aim its progress events at somebody else's transfer room.
  if (typeof socketId === 'string' && io.sockets.sockets.has(socketId)) {
    targets.push(socketId);
  }

  return (event, payload) => {
    io.to(targets).emit(event, { transferId, ...payload });
  };
}

router.post('/', upload.single('file'), async (req, res) => {
  const io = req.app.get('io');
  const originalFilePath = req.file?.path;
  let compressedPath = null;
  let finalPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      password,
      expiresIn,
      maxDownloads,
      socketId,
      compressionLevel = 6
    } = req.body;

    const transferId = await encryption.generateTransferId();
    const originalSize = req.file.size;
    const originalFilename = decodeFilename(req.file.originalname);
    const mimeType = req.file.mimetype;

    const emit = makeEmitter(io, transferId, socketId);

    emit('upload-started', { filename: originalFilename });

    const iv = await encryption.generateIV();
    const salt = await encryption.generateSalt();
    const fileKey = await encryption.generateKey();

    compressedPath = path.join(
      __dirname,
      '..',
      'uploads',
      'temp',
      `${transferId}.compressed`
    );
    const preferredAlgorithm = compression.selectAlgorithm(mimeType);

    emit('upload-progress', {
      stage: 'compressing',
      progress: 30,
      algorithm: preferredAlgorithm
    });

    const level = Math.min(9, Math.max(1, parseInt(compressionLevel, 10) || 6));
    const compressionResult = await compression.compressFile(
      originalFilePath,
      compressedPath,
      preferredAlgorithm,
      level
    );

    // compressFile downgrades to 'none' when compression would inflate the
    // payload, so record what was actually applied — the download path needs
    // the real algorithm to reverse it.
    const algorithm = compressionResult.algorithm;

    emit('upload-progress', { stage: 'encrypting', progress: 60 });

    const compressedData = fs.readFileSync(compressedPath);
    const { encrypted, authTag } = encryption.encrypt(
      compressedData,
      fileKey,
      iv
    );

    finalPath = path.join(__dirname, '..', 'uploads', `${transferId}.enc`);
    fs.writeFileSync(finalPath, encrypted);

    const checksum = encryption.generateChecksum(encrypted);

    safeUnlink(originalFilePath);
    safeUnlink(compressedPath);

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    let expiresAt = null;
    if (expiresIn) {
      const hours = parseInt(expiresIn, 10);
      if (Number.isFinite(hours) && hours > 0) {
        expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      }
    }

    const compressedSize = encrypted.length;
    const savingsPercent = originalSize
      ? Number(((1 - compressedSize / originalSize) * 100).toFixed(2))
      : 0;
    const spaceSavedBytes = originalSize - compressedSize;

    transferDb.create({
      id: transferId,
      filename: `${transferId}.enc`,
      original_filename: originalFilename,
      original_size: originalSize,
      compressed_size: compressedSize,
      compression_ratio: compressionResult.ratio,
      space_saved_percent: savingsPercent,
      algorithm,
      encryption_iv: iv,
      encryption_salt: salt,
      encryption_auth_tag: authTag,
      password_hash: passwordHash,
      mime_type: mimeType,
      expires_at: expiresAt,
      max_downloads:
        maxDownloads && parseInt(maxDownloads, 10) > 0
          ? parseInt(maxDownloads, 10)
          : null,
      checksum
    });

    logDb.create({
      transfer_id: transferId,
      action: 'upload',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      details: JSON.stringify({
        originalSize,
        compressedSize,
        savingsPercent
      })
    });

    emit('upload-progress', { stage: 'complete', progress: 100 });

    res.json({
      success: true,
      transfer: {
        id: transferId,
        filename: originalFilename,
        originalSize: compression.formatBytes(originalSize),
        originalSizeBytes: originalSize,
        compressedSize: compression.formatBytes(compressedSize),
        compressedSizeBytes: compressedSize,
        spaceSaved: compression.formatBytes(spaceSavedBytes),
        spaceSavedBytes,
        spaceSavedPercent: `${savingsPercent}%`,
        compressionRatio: `${compressionResult.ratio}%`,
        algorithm,
        expiresAt,
        maxDownloads: maxDownloads || 'Unlimited',
        hasPassword: !!password
      },
      decryptionKey: fileKey,
      authTag,
      downloadUrl: `/download/${transferId}#key=${fileKey}&tag=${authTag}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    safeUnlink(originalFilePath);
    safeUnlink(compressedPath);
    // Don't leave an orphaned .enc blob behind when the record was never stored
    safeUnlink(finalPath);

    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

router.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      message: `Max upload size is ${MAX_FILE_BYTES / (1024 * 1024)}MB`
    });
  }
  return res.status(500).json({
    error: err.message || 'Upload failed'
  });
});

export default router;
