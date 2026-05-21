/**
 * Transfer tracker — persists per-individual bytes downloaded to IDB.
 * Survives page reloads and tab closures.
 * @module utils/transfer-tracker
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { S, notify } from './queue-state.js';

const IDB_KEY = 'transfer-bytes';
const RATE_ALPHA = 0.3;

/** @type {Record<string, number>} */
let cache = null;
/** @type {number} */ let lastTs = 0;
/** @type {number} */ let smoothedRate = 0;

async function load() {
  if (cache) return cache;
  await idb.openDB();
  cache = (await idb.get('settings', IDB_KEY)) || {};
  return cache;
}

/**
 * Add bytes to the current scoring individual's tally.
 * @param {number} bytes
 * @param {number} [fetchMs] - duration of the fetch in ms (for first-sample rate)
 */
export async function trackTransfer(bytes, fetchMs) {
  const id = S.currentScoringId;
  if (!id || !bytes) return;
  const data = await load();
  data[id] = (data[id] || 0) + bytes;
  S.transferBytes = data;

  // EMA transfer rate
  const now = Date.now();
  let dt;
  if (lastTs > 0) {
    dt = (now - lastTs) / 1000;
  } else if (fetchMs > 0) {
    // First sample — use the fetch duration itself
    dt = fetchMs / 1000;
  }
  if (dt > 0) {
    const instant = bytes / dt;
    smoothedRate = smoothedRate > 0
      ? smoothedRate * (1 - RATE_ALPHA) + instant * RATE_ALPHA
      : instant;
  }
  lastTs = now;
  S.transferRate = smoothedRate;
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
  smoothedRate = 0;
  lastTs = 0;
  S.transferRate = 0;
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
