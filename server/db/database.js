import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'data.json');
const DB_TMP = DB_FILE + '.tmp';

const LOG_RETENTION = 500;

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
    }
  } catch (error) {
    console.error('Error loading database:', error);
  }
  return { transfers: [], logs: [] };
}

let saveTimer = null;
let dirty = false;

function persist(data) {
  fs.writeFileSync(DB_TMP, JSON.stringify(data, null, 2));
  fs.renameSync(DB_TMP, DB_FILE);
}

function scheduleSave(data) {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      persist(data);
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }, 40);
}

let db = loadDatabase();

export function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    persist({ transfers: [], logs: [] });
  }
  console.log('Database ready:', DB_FILE);
}

export const transferDb = {
  create: (transfer) => {
    const newTransfer = {
      ...transfer,
      created_at: new Date().toISOString(),
      download_count: 0,
      status: 'active'
    };
    db.transfers.push(newTransfer);
    scheduleSave(db);
    return newTransfer;
  },

  getById: (id) => db.transfers.find((t) => t.id === id),

  getAll: (limit = 50, offset = 0, { includeInactive = false } = {}) => {
    const list = includeInactive
      ? db.transfers
      : db.transfers.filter((t) => t.status === 'active');
    return list
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(offset, offset + limit);
  },

  count: ({ includeInactive = false } = {}) => {
    return includeInactive
      ? db.transfers.length
      : db.transfers.filter((t) => t.status === 'active').length;
  },

  updateDownloadCount: (id) => {
    const transfer = db.transfers.find((t) => t.id === id);
    if (transfer) {
      transfer.download_count = (transfer.download_count || 0) + 1;
      if (
        transfer.max_downloads &&
        transfer.download_count >= transfer.max_downloads
      ) {
        transfer.status = 'exhausted';
      }
      scheduleSave(db);
    }
    return transfer;
  },

  updateStatus: (id, status) => {
    const transfer = db.transfers.find((t) => t.id === id);
    if (transfer) {
      transfer.status = status;
      scheduleSave(db);
    }
    return transfer;
  },

  delete: (id) => {
    const index = db.transfers.findIndex((t) => t.id === id);
    if (index !== -1) {
      const [removed] = db.transfers.splice(index, 1);
      scheduleSave(db);
      return removed;
    }
    return null;
  },

  /**
   * Flip newly-expired transfers to `expired` and return them, so the caller
   * can remove the encrypted payloads they leave behind on disk.
   */
  cleanupExpired: () => {
    const now = new Date();
    const expired = [];
    db.transfers.forEach((t) => {
      if (
        t.expires_at &&
        new Date(t.expires_at) < now &&
        t.status === 'active'
      ) {
        t.status = 'expired';
        expired.push(t);
      }
    });
    if (expired.length > 0) scheduleSave(db);
    return expired;
  }
};

/**
 * Write any pending changes immediately. The debounced save would otherwise
 * drop writes made in the last few milliseconds before the process exits.
 */
export function flushDatabase() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!dirty) return;
  dirty = false;
  try {
    persist(db);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

export const logDb = {
  create: (log) => {
    const newLog = {
      id: (db.logs[db.logs.length - 1]?.id || 0) + 1,
      ...log,
      created_at: new Date().toISOString()
    };
    db.logs.push(newLog);
    if (db.logs.length > LOG_RETENTION) {
      db.logs.splice(0, db.logs.length - LOG_RETENTION);
    }
    scheduleSave(db);
    return newLog;
  },

  getByTransferId: (transferId) =>
    db.logs
      .filter((l) => l.transfer_id === transferId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),

  getRecent: (limit = 25) =>
    db.logs
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
};

export default db;
