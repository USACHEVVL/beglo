// Книги хранятся на телефоне в IndexedDB: отдельно краткие сведения и отдельно текст,
// чтобы список библиотеки открывался быстро даже с большими книгами.
// Если браузер не даёт хранить, книги живут только до закрытия страницы.

const DB_NAME = 'beglo';
const DB_VERSION = 1;
const memory = { meta: new Map(), content: new Map() };
let dbPromise = null;
let persistent = true;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in globalThis)) throw new Error('no idb');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('content')) db.createObjectStore('content', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        persistent = false;
        resolve(null);
      };
      req.onblocked = () => {
        persistent = false;
        resolve(null);
      };
    } catch {
      persistent = false;
      resolve(null);
    }
  });
  return dbPromise;
}

function run(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Не удалось сохранить книгу'));
    result = fn(tx);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isPersistent() {
  return persistent;
}

export async function listBooks() {
  const db = await open();
  if (!db) return [...memory.meta.values()];
  try {
    const tx = db.transaction('meta', 'readonly');
    return await request(tx.objectStore('meta').getAll());
  } catch {
    return [...memory.meta.values()];
  }
}

export async function getContent(id) {
  const db = await open();
  if (!db) return memory.content.get(id) || null;
  try {
    const tx = db.transaction('content', 'readonly');
    return (await request(tx.objectStore('content').get(id))) || memory.content.get(id) || null;
  } catch {
    return memory.content.get(id) || null;
  }
}

export async function saveBook(meta, content) {
  memory.meta.set(meta.id, meta);
  memory.content.set(meta.id, { id: meta.id, ...content });
  const db = await open();
  if (!db) return false;
  try {
    await run(db, ['meta', 'content'], 'readwrite', (tx) => {
      tx.objectStore('meta').put(meta);
      tx.objectStore('content').put({ id: meta.id, ...content });
    });
    return true;
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') throw err;
    persistent = false;
    return false;
  }
}

export async function deleteBook(id) {
  memory.meta.delete(id);
  memory.content.delete(id);
  const db = await open();
  if (!db) return;
  try {
    await run(db, ['meta', 'content'], 'readwrite', (tx) => {
      tx.objectStore('meta').delete(id);
      tx.objectStore('content').delete(id);
    });
  } catch {
    /* уже нет — и хорошо */
  }
}
