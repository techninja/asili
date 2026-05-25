/**
 * Settings view handlers — scoring prefs, individual management, clear all.
 * @module pages/settings/settings-handlers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { saveScoringSettings } from '#utils/queue-settings.js';
import { resetQueue } from '#utils/scoring-queue.js';
import { clearFamilyCache } from '#organisms/trait-grid/render-card.js';
import { clearLocalStorage, IDB_STORES } from '#utils/storage.js';

/** @param {object} host @param {Event} e */
export async function handleMemoryChange(host, e) {
  host.memoryLimit = /** @type {HTMLSelectElement} */ (e.target).value;
  await saveScoringSettings({ memoryLimit: host.memoryLimit });
}

/** @param {object} host @param {Event} e */
export async function handleWorkerChange(host, e) {
  host.workerCount = Number(/** @type {HTMLSelectElement} */ (e.target).value);
  await saveScoringSettings({ workerCount: host.workerCount });
}

/** @param {object} host @param {Event} e */
export async function handleAutoScoreChange(host, e) {
  host.autoScore = /** @type {HTMLInputElement} */ (e.target).checked;
  await saveScoringSettings({ autoScore: host.autoScore });
}

/** @param {object & HTMLElement} host */
export async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleUpgrade(host, e) {
  const { id } = e.detail;
  try {
    await idb.openDB();
    const ind = await idb.get('individuals', id);
    if (ind) await idb.put('individuals', id, { ...ind, hasImputed: true });
    const keys = await idb.getAllKeys('results');
    for (const k of keys) {
      if (String(k).startsWith(`${id}:`)) await idb.del('results', k);
    }
    await idb.del('variants', id);
    host.individuals = await idb.getAll('individuals');
  } catch (err) {
    console.error(err);
  }
}

/** @param {object & HTMLElement} _host */
export async function doClearAll(_host) {
  await resetQueue();
  clearFamilyCache();
  clearLocalStorage();
  await idb.openDB();
  for (const store of IDB_STORES) await idb.clear(store);
  window.location.href = '/';
}
