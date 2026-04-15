/**
 * File handle persistence — uses File System Access API to persist
 * imputed .asili file handles across page reloads (Chrome/Edge only).
 * Caches handles after first load so permission requests stay in gesture.
 * @module utils/file-handle
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

const STORE = 'settings';

/** @type {Map<string, FileSystemFileHandle>|null} */
let handleCache = null;

/** @returns {boolean} */
export function isSupported() {
  return 'showOpenFilePicker' in window;
}

/** @param {string} individualId @param {FileSystemFileHandle} handle */
export async function storeHandle(individualId, handle) {
  if (!isSupported()) return;
  try {
    await idb.openDB();
    await idb.put(STORE, `fh:${individualId}`, handle);
    if (handleCache) handleCache.set(individualId, handle);
  } catch (e) {
    console.error('[file-handle] store failed:', e);
  }
}

/** Load all handles from IDB into cache (call early, before user gesture). */
async function ensureCache() {
  if (handleCache) return;
  handleCache = new Map();
  if (!isSupported()) return;
  try {
    await idb.openDB();
    const keys = await idb.getAllKeys(STORE);
    const fhKeys = keys.filter((k) => String(k).startsWith('fh:'));
    console.log(`[file-handle] cache: ${fhKeys.length} handle(s) in IDB`);
    for (const k of fhKeys) {
      const handle = await idb.get(STORE, k);
      if (handle?.queryPermission) {
        handleCache.set(String(k).slice(3), handle);
      } else {
        console.warn(`[file-handle] ${k}: not a valid handle`, typeof handle);
      }
    }
    console.log(`[file-handle] cache loaded: ${handleCache.size} handle(s)`);
  } catch (e) {
    console.error('[file-handle] cache load:', e);
  }
}

/**
 * Restore all persisted file handles.
 * @param {boolean} [requestIfNeeded] - If true, prompt for permission (requires gesture)
 * @returns {Promise<Map<string, File>>}
 */
export async function restoreAll(requestIfNeeded = false) {
  await ensureCache();
  const result = new Map();
  for (const [id, handle] of handleCache) {
    try {
      // @ts-ignore — queryPermission/requestPermission are Chrome-only
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        result.set(id, await handle.getFile());
      } else if (requestIfNeeded) {
        // @ts-ignore
        const req = await handle.requestPermission({ mode: 'read' });
        if (req === 'granted') result.set(id, await handle.getFile());
      }
    } catch (e) {
      console.error(`[file-handle] restore ${id}:`, e);
    }
  }
  return result;
}

/** @param {string} individualId */
export async function removeHandle(individualId) {
  if (!isSupported()) return;
  await idb.openDB();
  await idb.del(STORE, `fh:${individualId}`);
  if (handleCache) handleCache.delete(individualId);
}
