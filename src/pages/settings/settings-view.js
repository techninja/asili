/**
 * Settings view — individual management, storage, data export/import.
 * @module pages/settings
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#molecules/individual-list/individual-list.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { getScoringSettings, saveScoringSettings } from '#utils/queue-settings.js';
import { resetQueue } from '#utils/scoring-queue.js';
import { clearFamilyCache } from '#organisms/trait-grid/render-card.js';
import { clearLocalStorage, IDB_STORES } from '#utils/storage.js';
import { storageSection, scoringSection, dangerSection } from './settings-sections.js';

export default define({
  tag: 'settings-view',
  [router.connect]: { url: '/settings' },
  individuals: {
    value: /** @type {Array<object>} */ ([]),
    connect: (host, _key, invalidate) => {
      loadData(host).then(invalidate);
    },
  },
  storageInfo: '',
  confirmClear: false,
  memoryLimit: '2GB',
  workerCount: 1,
  autoScore: true,
  render: {
    value: ({
      individuals,
      storageInfo,
      confirmClear,
      memoryLimit,
      workerCount,
      autoScore,
    }) => html`
      <div class="settings">
        <a href="/beta" class="settings__back">← Back</a>
        <h1 class="settings__title">Settings</h1>

        <section class="settings__section">
          <h2>Individuals</h2>
          <individual-list
            individuals="${JSON.stringify(individuals)}"
            ondelete-individual="${handleDelete}"
            onupgrade-individual="${handleUpgrade}"
          ></individual-list>
        </section>

        ${storageSection(storageInfo)}
        ${scoringSection(
          memoryLimit,
          workerCount,
          autoScore,
          handleMemoryChange,
          handleWorkerChange,
          handleAutoScoreChange,
        )}
        ${dangerSection(confirmClear, doClearAll)}

        <section class="settings__section">
          <h2>About</h2>
          <p class="settings__meta">
            Asili v1.0 · Privacy-first · Your data never leaves this device
          </p>
        </section>
      </div>
    `,
    shadow: false,
  },
});

/** @param {object} host */
async function loadData(host) {
  try {
    await idb.openDB();
    host.individuals = await idb.getAll('individuals');
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      const used = (estimate.usage / 1024 / 1024).toFixed(1);
      const quota = (estimate.quota / 1024 / 1024 / 1024).toFixed(1);
      host.storageInfo = `${used} MB used of ${quota} GB available`;
    }
    const prefs = await getScoringSettings();
    host.memoryLimit = prefs.memoryLimit;
    host.workerCount = prefs.workerCount;
    host.autoScore = prefs.autoScore;
  } catch (e) {
    console.error(e);
    /* first visit */
  }
}

/** @param {object} host @param {Event} e */
async function handleMemoryChange(host, e) {
  host.memoryLimit = /** @type {HTMLSelectElement} */ (e.target).value;
  await saveScoringSettings({ memoryLimit: host.memoryLimit });
}

/** @param {object} host @param {Event} e */
async function handleWorkerChange(host, e) {
  host.workerCount = Number(/** @type {HTMLSelectElement} */ (e.target).value);
  await saveScoringSettings({ workerCount: host.workerCount });
}

/** @param {object} host @param {Event} e */
async function handleAutoScoreChange(host, e) {
  host.autoScore = /** @type {HTMLInputElement} */ (e.target).checked;
  await saveScoringSettings({ autoScore: host.autoScore });
}

/** @param {object & HTMLElement} host */
async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
async function handleUpgrade(host, e) {
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
  } catch (e) {
    console.error(e);
    /* upgrade failed */
  }
}

/** @param {object & HTMLElement} _host */
async function doClearAll(_host) {
  await resetQueue();
  clearFamilyCache();
  clearLocalStorage();
  await idb.openDB();
  for (const store of IDB_STORES) {
    await idb.clear(store);
  }
  window.location.href = '/';
}
