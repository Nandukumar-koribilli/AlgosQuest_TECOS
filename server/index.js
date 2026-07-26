import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import uploadRoutes from './routes/upload.js';
import downloadRoutes from './routes/download.js';
import transferRoutes from './routes/transfers.js';

import { initDatabase, transferDb, flushDatabase } from './db/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Encryption-IV']
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(path.join(uploadsDir, 'temp'), { recursive: true });

initDatabase();

app.set('io', io);

app.use('/api/upload', uploadRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/transfers', transferRoutes);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Secure Transfer Protocol',
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal Server Error' });
});

io.on('connection', (socket) => {
  // `ack` lets the client wait until it is actually in the room before kicking
  // off the request whose progress it wants to observe.
  socket.on('join-transfer', (transferId, ack) => {
    if (typeof transferId === 'string' && transferId.length > 0) {
      socket.join(`transfer-${transferId}`);
    }
    if (typeof ack === 'function') ack({ joined: true });
  });

  socket.on('leave-transfer', (transferId, ack) => {
    if (typeof transferId === 'string') {
      socket.leave(`transfer-${transferId}`);
    }
    if (typeof ack === 'function') ack({ left: true });
  });
});

// Periodic expiration cleanup. Marking a transfer expired is not enough — the
// encrypted payload has to leave the disk too, otherwise every transfer that
// ever expired stays readable in ./uploads forever.
function reclaimStorage() {
  transferDb.cleanupExpired();

  for (const transfer of transferDb.getAll(10_000, 0, { includeInactive: true })) {
    if (transfer.status === 'active' || !transfer.filename) continue;

    const filePath = path.join(uploadsDir, path.basename(transfer.filename));
    if (!fs.existsSync(filePath)) continue;

    try {
      fs.unlinkSync(filePath);
      console.log(`Reclaimed ${transfer.status} transfer ${transfer.id}`);
    } catch (err) {
      console.warn('Could not remove', filePath, err.message);
    }
  }
}

setInterval(() => {
  try {
    reclaimStorage();
  } catch (err) {
    console.error('Cleanup failed:', err);
  }
}, 60 * 1000).unref();

const PORT = parseInt(process.env.PORT, 10) || 3001;

httpServer.listen(PORT, () => {
  console.log(`\n  Secure Transfer Protocol`);
  console.log(`  ─────────────────────────`);
  console.log(`  API      http://localhost:${PORT}`);
  console.log(`  Client   ${CLIENT_URL}`);
  console.log(`  Cipher   AES-256-GCM`);
  console.log(`  Codec    Gzip / Brotli`);
  console.log('');
});

// The debounced writer would otherwise drop transfers created moments before
// the process is stopped.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    flushDatabase();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

export { io };
