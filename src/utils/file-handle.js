/**
 * File handle persistence — uses File System Access API to persist
 * imputed .asili file handles across page reloads (Chrome/Edge only).
 * Falls back gracefully — returns null on unsupported browsers.
 * @module utils/file-handle
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

const STORE = 'settings';

/** @returns {boolean} */
export function isSupported() {
  return 'showOpenFilePicker' in window;
}

/**
 * Store a FileSystemFileHandle for an individual.
 * @param {string} individualId
 * @param {FileSystemFileHandle} handle
 */
export async function storeHandle(individualId, handle) {
  if (!isSupported()) return;
  try {
    await idb.openDB();
    await idb.put(STORE, `fh:${individualId}`, handle);
    console.log(`[file-handle] stored handle for ${individualId}`);
  } catch (e) {
    console.error('[file-handle] store failed:', e);
  }
}

/**
 * Restore all persisted file handles.
 * @param {boolean} [requestIfNeeded] - If true, prompt user for permission (requires gesture)
 * @returns {Promise<Map<string, File>>}
 */
export async function restoreAll(requestIfNeeded = false) {
  if (!isSupported()) return new Map();
  await idb.openDB();
  const keys = await idb.getAllKeys(STORE);
  const result = new Map();
  for (const k of keys) {
    if (!String(k).startsWith('fh:')) continue;
    const id = String(k).slice(3);
    try {
      const handle = await idb.get(STORE, k);
      if (!handle?.queryPermission) continue;
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        result.set(id, await handle.getFile());
      } else if (requestIfNeeded) {
        const req = await handle.requestPermission({ mode: 'read' });
        if (req === 'granted') result.set(id, await handle.getFile());
      }
    } catch (e) {
      console.error(`[file-handle] restore ${id}:`, e);
    }
  }
  return result;
}

/**
 * Remove a stored handle.
 * @param {string} individualId
 */
export async function removeHandle(individualId) {
  if (!isSupported()) return;
  await idb.openDB();
  await idb.del(STORE, `fh:${individualId}`);
}
