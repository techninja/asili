/**
 * Scoring queue settings — persisted preferences for DuckDB memory, workers, auto-score.
 * @module utils/queue-settings
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

/** Default worker count based on available cores (leave 2 for UI + OS). */
const DEFAULT_WORKERS = 1;

/**
 * Get scoring settings.
 * @returns {Promise<{memoryLimit: string, workerCount: number, autoScore: boolean}>}
 */
export async function getScoringSettings() {
  await idb.openDB();
  const s = await idb.get('settings', 'scoringPrefs');
  return { memoryLimit: '2GB', workerCount: DEFAULT_WORKERS, autoScore: true, ...s };
}

/**
 * Save scoring settings.
 * @param {object} prefs
 */
export async function saveScoringSettings(prefs) {
  await idb.openDB();
  const existing = (await idb.get('settings', 'scoringPrefs')) || {};
  await idb.put('settings', 'scoringPrefs', { ...existing, ...prefs });
}
