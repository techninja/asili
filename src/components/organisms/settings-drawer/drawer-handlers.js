/**
 * Settings drawer handlers.
 * @module components/organisms/settings-drawer/drawer-handlers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { getScoringSettings, saveScoringSettings } from '#utils/queue-settings.js';
import { resetQueue } from '#utils/scoring-queue.js';
import { clearFamilyCache } from '#organisms/trait-grid/render-card.js';
import { clearLocalStorage, IDB_STORES, get, set, remove } from '#utils/storage.js';

/** @param {object} host */
export function close(host) {
  host.open = false;
}

/** @param {object} host */
export async function loadData(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');

  // Count stored results and individuals for a meaningful size
  const resultKeys = await idb.getAllKeys('results');
  const indCount = host.individuals.length;
  const resultCount = resultKeys.length;

  // Manual size measurement — navigator.storage.estimate() reports 0 when not persisted
  let totalBytes = 0;
  for (const store of ['individuals', 'variants', 'results', 'settings']) {
    const all = await idb.getAll(store);
    totalBytes += new Blob([JSON.stringify(all)]).size;
  }
  const mb = (totalBytes / 1024 / 1024).toFixed(1);
  host.storageInfo = `${mb} MB stored (${indCount} individuals, ${resultCount} results)`;

  const prefs = await getScoringSettings();
  host.autoScore = prefs.autoScore;
  host.memoryLimit = prefs.memoryLimit;
  host.ancestry = get('ancestry') || '';
}

/** @param {object} host */
export async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** @param {object} host @param {Event} e */
export async function handleAutoScore(host, e) {
  host.autoScore = /** @type {HTMLInputElement} */ (e.target).checked;
  await saveScoringSettings({ autoScore: host.autoScore });
}

/** @param {object} host @param {Event} e */
export async function handleMemory(host, e) {
  host.memoryLimit = /** @type {HTMLSelectElement} */ (e.target).value;
  await saveScoringSettings({ memoryLimit: host.memoryLimit });
}

/** @param {object} host @param {Event} e */
export function handleAncestry(host, e) {
  const val = /** @type {HTMLSelectElement} */ (e.target).value;
  host.ancestry = val;
  if (val) set('ancestry', val);
  else remove('ancestry');
}

/** @param {object} _host */
export async function doClearAll(_host) {
  await resetQueue();
  clearFamilyCache();
  clearLocalStorage();
  await idb.openDB();
  for (const s of IDB_STORES) await idb.clear(s);
  window.location.href = '/';
}
