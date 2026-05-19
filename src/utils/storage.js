/**
 * Unified storage — single source of truth for all persisted state.
 * localStorage keys + IndexedDB stores defined here.
 * Import STORAGE for key references, use get/set/clearAll helpers.
 * @module utils/storage
 */

/** localStorage key definitions with defaults. */
export const STORAGE = {
  activeId: { key: 'asili_activeId', default: '' },
  ancestry: { key: 'asili_ancestry', default: '' },
  gridPrefs: { key: 'asili_gridPrefs', default: '{}' },
  tableCols: { key: 'asili_tableCols', default: null },
  paused: { key: 'asili_paused', default: '' },
  appState: { key: 'appState', default: '{}' },
};

/** All localStorage keys managed by Asili. */
const ALL_KEYS = Object.values(STORAGE).map((s) => s.key);

/** IDB store names. */
export const IDB_STORES = ['individuals', 'variants', 'results', 'settings'];

/** @param {keyof typeof STORAGE} id @returns {string|null} */
export function get(id) {
  const s = STORAGE[id];
  return localStorage.getItem(s.key) ?? s.default;
}

/** @param {keyof typeof STORAGE} id @param {string} value */
export function set(id, value) {
  localStorage.setItem(STORAGE[id].key, value);
}

/** @param {keyof typeof STORAGE} id */
export function remove(id) {
  localStorage.removeItem(STORAGE[id].key);
}

/** Wipe all Asili localStorage keys. */
export function clearLocalStorage() {
  for (const k of ALL_KEYS) localStorage.removeItem(k);
}
