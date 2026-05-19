/**
 * Settings data helpers — export/import IndexedDB data as JSON.
 * @module pages/settings/settings-helpers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

/** Export all individuals and results as a JSON download. */
export async function exportData() {
  await idb.openDB();
  const data = { individuals: await idb.getAll('individuals'), results: {} };
  const keys = await idb.getAllKeys('results');
  for (const k of keys) data.results[k] = await idb.get('results', k);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'asili-export.json' }).click();
  URL.revokeObjectURL(url);
}

/**
 * Import individuals and results from a JSON file.
 * @param {object & HTMLElement} host
 * @param {Event} e
 */
export async function importData(host, e) {
  const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  await idb.openDB();
  if (data.individuals) {
    for (const ind of data.individuals) await idb.put('individuals', ind.id, ind);
  }
  if (data.results) {
    for (const [k, v] of Object.entries(data.results)) await idb.put('results', k, v);
  }
  host.individuals = await idb.getAll('individuals');
}
