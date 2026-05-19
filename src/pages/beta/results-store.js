/**
 * Results store — data-layer-backed with in-memory cache.
 * Keyed by individualId:traitId. Routes through the unified data layer.
 * @module pages/beta/results-store
 */

import { createDataLayer, getDataLayer } from '/packages/core/src/data-layer/create.js';
import { get, set } from '#utils/storage.js';

/** @type {Record<string, object>} In-memory cache for render perf. */
export const results = {};

/** @param {string} traitId @returns {object|undefined} */
export function getResult(traitId) {
  return results[traitId];
}

/** @type {string} */
let activeId = get('activeId') || '';

/** @type {number} Bumped on every write — lets consumers detect changes. */
export let version = 0;

/** @returns {string} */
export function getActiveId() {
  return activeId;
}

/**
 * Load all cached results for an individual via data layer.
 * @param {string} individualId
 * @returns {Promise<number>} count loaded
 */
export async function loadResults(individualId) {
  activeId = individualId;
  set('activeId', individualId);
  clearMemory();
  const dl = await ensureDataLayer();
  const all = await dl.getAllResults(individualId);
  let loaded = 0;
  for (const r of all) {
    if (r?.traitId) {
      results[r.traitId] = r;
      loaded++;
    }
  }
  version++;
  return loaded;
}

/**
 * Save a result to both memory cache and persistent storage.
 * @param {string} traitId
 * @param {object} result
 */
export async function setResult(traitId, result) {
  const stored = { ...result, traitId };
  results[traitId] = stored;
  version++;
  if (activeId) {
    const dl = await ensureDataLayer();
    await dl.saveRiskScore(activeId, traitId, stored);
  }
}

/** Clear in-memory cache only. */
function clearMemory() {
  for (const key of Object.keys(results)) delete results[key];
}

/** Clear both memory and persistent storage for active individual. */
export async function clearResults() {
  if (activeId) {
    const dl = await ensureDataLayer();
    await dl.clearResults(activeId);
  }
  clearMemory();
  version++;
}

/** @returns {number} */
export function resultCount() {
  return Object.keys(results).length;
}

/**
 * Ensure data layer is initialized.
 * @returns {Promise<import('/packages/core/src/data-layer/interface.js').DataLayer>}
 */
async function ensureDataLayer() {
  try {
    return getDataLayer();
  } catch {
    /* first call */
  }
  return createDataLayer({ mode: 'browser' });
}
