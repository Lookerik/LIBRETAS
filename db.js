/* db.js — capa de datos sobre IndexedDB. Sin backend, sin red. */

const DB_NAME = 'libretas-db';
const DB_VERSION = 1;
const STORE_NOTEBOOKS = 'notebooks';
const STORE_NOTES = 'notes';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
        const nb = db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
        nb.createIndex('updatedAt', 'updatedAt');
        nb.createIndex('order', 'order');
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const notes = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        notes.createIndex('notebookId', 'notebookId');
        notes.createIndex('updatedAt', 'updatedAt');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

const Db = {
  uuid,

  // ---------- Cuadernos ----------
  async getNotebooks() {
    const store = await tx(STORE_NOTEBOOKS, 'readonly');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  async createNotebook({ name, color }) {
    const notebooks = await this.getNotebooks();
    const now = Date.now();
    const notebook = {
      id: uuid(),
      name: name || 'Cuaderno sin título',
      color: color || '#3B6E68',
      order: notebooks.length,
      createdAt: now,
      updatedAt: now,
    };
    const store = await tx(STORE_NOTEBOOKS, 'readwrite');
    await reqToPromise(store.add(notebook));
    return notebook;
  },

  async updateNotebook(id, patch) {
    const store = await tx(STORE_NOTEBOOKS, 'readwrite');
    const current = await reqToPromise(store.get(id));
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async deleteNotebook(id) {
    const notesStore = await tx(STORE_NOTES, 'readwrite');
    const idx = notesStore.index('notebookId');
    const notes = await reqToPromise(idx.getAll(id));
    await Promise.all(notes.map((n) => reqToPromise(notesStore.delete(n.id))));
    const nbStore = await tx(STORE_NOTEBOOKS, 'readwrite');
    await reqToPromise(nbStore.delete(id));
  },

  // ---------- Notas ----------
  async getNotesByNotebook(notebookId) {
    const store = await tx(STORE_NOTES, 'readonly');
    const idx = store.index('notebookId');
    const notes = await reqToPromise(idx.getAll(notebookId));
    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getAllNotes() {
    const store = await tx(STORE_NOTES, 'readonly');
    return reqToPromise(store.getAll());
  },

  async getNote(id) {
    const store = await tx(STORE_NOTES, 'readonly');
    return reqToPromise(store.get(id));
  },

  async createNote({ notebookId, title, content, lineHeight }) {
    const now = Date.now();
    const note = {
      id: uuid(),
      notebookId,
      title: title || 'Nueva página',
      content: content || '',
      lineHeight: lineHeight || 32,
      createdAt: now,
      updatedAt: now,
    };
    const store = await tx(STORE_NOTES, 'readwrite');
    await reqToPromise(store.add(note));
    return note;
  },

  async updateNote(id, patch) {
    const store = await tx(STORE_NOTES, 'readwrite');
    const current = await reqToPromise(store.get(id));
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async deleteNote(id) {
    const store = await tx(STORE_NOTES, 'readwrite');
    await reqToPromise(store.delete(id));
  },

  // ---------- Copia de seguridad ----------
  async exportAll() {
    const notebooks = await this.getNotebooks();
    const notes = await this.getAllNotes();
    return {
      app: 'libretas',
      version: 1,
      exportedAt: new Date().toISOString(),
      notebooks,
      notes,
    };
  },

  async importAll(data, { mode = 'merge' } = {}) {
    if (!data || !Array.isArray(data.notebooks) || !Array.isArray(data.notes)) {
      throw new Error('El archivo de copia de seguridad no tiene un formato válido.');
    }

    if (mode === 'replace') {
      const nbStore = await tx(STORE_NOTEBOOKS, 'readwrite');
      await reqToPromise(nbStore.clear());
      const notesStore = await tx(STORE_NOTES, 'readwrite');
      await reqToPromise(notesStore.clear());
    }

    const nbStore = await tx(STORE_NOTEBOOKS, 'readwrite');
    for (const nb of data.notebooks) {
      await reqToPromise(nbStore.put(nb));
    }
    const notesStore = await tx(STORE_NOTES, 'readwrite');
    for (const note of data.notes) {
      await reqToPromise(notesStore.put(note));
    }
  },
};
