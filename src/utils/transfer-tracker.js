/**
 * Transfer tracker — persists per-individual bytes downloaded to IDB.
 * Survives page reloads and tab closures.
 * @module utils/transfer-tracker
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { S, notify } from './queue-state.js';

const IDB_KEY = 'transfer-bytes';

/** @type {Record<string, number>} */
let cache = null;
/** @type {number} */ let startTs = 0;
/** @type {number} */ let sessionBytes = 0;

/**
 *
 */
async function load() {
  if (cache) return cache;
  await idb.openDB();
  cache = (await idb.get('settings', IDB_KEY)) || {};
  return cache;
}

/**
 * Add bytes to the current scoring individual's tally.
 * @param {number} bytes
 */
export async function trackTransfer(bytes) {
  const id = S.currentScoringId;
  if (!id || !bytes) return;
  const data = await load();
  data[id] = (data[id] || 0) + bytes;
  S.transferBytes = data;

  const now = Date.now();
  if (!startTs) startTs = now;
  sessionBytes += bytes;

  // Update state for snapshot to recalculate on every tick
  S._transferStartTs = startTs;
  S._transferSessionBytes = sessionBytes;
  S.transferRate = sessionBytes / ((now - startTs) / 1000 || 1);
  S._transferLastTs = now;

  notify();
  idb.put('settings', IDB_KEY, data);
}

/**
 * Clear transfer tally for an individual (on rescore).
 * @param {string} id
 */
export async function clearTransfer(id) {
  const data = await load();
  delete data[id];
  S.transferBytes = data;
  startTs = 0;
  sessionBytes = 0;
  S.transferRate = 0;
  S._transferLastTs = 0;
  S._transferStartTs = 0;
  S._transferSessionBytes = 0;
  idb.put('settings', IDB_KEY, data);
}

/**
 * Get total bytes across all individuals.
 * @returns {Promise<number>}
 */
export async function getTotalTransfer() {
  const data = await load();
  return Object.values(data).reduce((sum, v) => sum + v, 0);
}

/**
 * Get per-individual transfer map.
 * @returns {Promise<Record<string, number>>}
 */
export async function getTransferMap() {
  return load();
}
