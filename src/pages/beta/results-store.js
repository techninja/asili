/**
 * Results store — IndexedDB-backed with in-memory cache.
 * Keyed by individualId:traitId.
 * @module pages/beta/results-store
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

/** @type {Record<string, object>} */
export const results = {};

/** @type {string} */
let activeId = '';

/** @returns {string} */
export function getActiveId() {
  return activeId;
}

/**
 * Load all cached results for an individual from IndexedDB.
 * @param {string} individualId
 * @returns {Promise<number>} count loaded
 */
export async function loadResults(individualId) {
  activeId = individualId;
  clearMemory();
  await idb.openDB();
  const keys = await idb.getAllKeys('results');
  const prefix = `${individualId}:`;
  let count = 0;
  for (const k of keys) {
    if (String(k).startsWith(prefix)) {
      const r = await idb.get('results', k);
      if (r) {
        const traitId = String(k).slice(prefix.length);
        results[traitId] = r;
        count++;
      }
    }
  }
  return count;
}

/**
 * Save a result to both memory and IndexedDB.
 * @param {string} traitId
 * @param {object} result
 */
export async function setResult(traitId, result) {
  results[traitId] = result;
  if (activeId) {
    await idb.put('results', `${activeId}:${traitId}`, result);
  }
}

/** Clear in-memory cache only. */
function clearMemory() {
  for (const key of Object.keys(results)) delete results[key];
}

/** Clear both memory and IndexedDB for active individual. */
export async function clearResults() {
  if (activeId) {
    const keys = await idb.getAllKeys('results');
    for (const k of keys) {
      if (String(k).startsWith(`${activeId}:`)) await idb.del('results', k);
    }
  }
  clearMemory();
}

/** @returns {number} */
export function resultCount() {
  return Object.keys(results).length;
}
