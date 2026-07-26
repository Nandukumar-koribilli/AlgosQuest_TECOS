const KEY = 'securetransfer.vault.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Vault write failed:', err);
  }
}

export const vault = {
  save(id, keyMaterial) {
    const store = read();
    store[id] = {
      key: keyMaterial.key,
      tag: keyMaterial.tag,
      filename: keyMaterial.filename || null,
      savedAt: new Date().toISOString()
    };
    write(store);
  },

  get(id) {
    return read()[id] || null;
  },

  all() {
    return read();
  },

  remove(id) {
    const store = read();
    delete store[id];
    write(store);
  },

  buildShareUrl(id) {
    const entry = this.get(id);
    if (!entry) return null;
    return `${window.location.origin}/download/${id}#key=${entry.key}&tag=${entry.tag}`;
  }
};
