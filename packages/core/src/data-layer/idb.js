/**
 * IndexedDB promise wrapper.
 * Manages the Asili database with stores for individuals, variants, results.
 * @module packages/core/src/data-layer/idb
 */

const DB_NAME = 'asili';
const DB_VERSION = 1;
const STORES = ['individuals', 'variants', 'results', 'settings'];

/** @type {IDBDatabase|null} */
let db = null;

/** @returns {Promise<IDBDatabase>} */
export async function openDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const name of STORES) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function getStore(storeName, mode = /** @type {IDBTransactionMode} */ ('readonly')) {
  const d = await openDB();
  return d.transaction(storeName, mode).objectStore(storeName);
}

/** @returns {Promise<any>} */
export async function get(storeName, key) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<any[]>} */
export async function getAll(storeName) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<void>} */
export async function put(storeName, key, value) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<void>} */
export async function del(storeName, key) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<string[]>} */
export async function getAllKeys(storeName) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(/** @type {string[]} */ (req.result));
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<void>} */
export async function clear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Close the database connection. */
export function closeDB() {
  if (db) { db.close(); db = null; }
}
