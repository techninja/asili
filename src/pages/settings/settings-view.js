/**
 * Settings view — individual management, storage, data export/import.
 * @module pages/settings
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#molecules/individual-list/individual-list.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { exportData, importData } from './settings-helpers.js';

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
  render: {
    value: ({ individuals, storageInfo, confirmClear }) => html`
      <div class="settings">
        <a href="/beta" class="settings__back">← Back</a>
        <h1 class="settings__title">Settings</h1>

        <section class="settings__section">
          <h2>Individuals</h2>
          <individual-list
            individuals="${JSON.stringify(individuals)}"
            ondelete-individual="${handleDelete}"
          ></individual-list>
        </section>

        <section class="settings__section">
          <h2>Storage</h2>
          <p class="settings__meta">${storageInfo || 'Calculating…'}</p>
          <div class="settings__actions">
            <button class="btn btn-secondary" onclick="${exportData}">📦 Export data</button>
            <label class="btn btn-secondary">
              📥 Import data
              <input type="file" accept=".json" class="sr-only" onchange="${importData}" />
            </label>
          </div>
        </section>

        <section class="settings__section">
          <h2>Danger Zone</h2>
          ${confirmClear
            ? html`
                <p class="settings__warn">
                  This will delete all individuals, variants, and results.
                </p>
                <div class="settings__actions">
                  <button class="btn btn-danger" onclick="${doClearAll}">
                    Yes, delete everything
                  </button>
                  <button
                    class="btn btn-ghost"
                    onclick="${(h) => {
                      h.confirmClear = false;
                    }}"
                  >
                    Cancel
                  </button>
                </div>
              `
            : html`<button
                class="btn btn-danger"
                onclick="${(h) => {
                  h.confirmClear = true;
                }}"
              >
                🗑 Clear all data
              </button>`}
        </section>

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
  } catch {
    /* first visit */
  }
}

/** @param {object & HTMLElement} host */
async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** @param {object & HTMLElement} host */
async function doClearAll(host) {
  await idb.openDB();
  for (const store of ['individuals', 'variants', 'results', 'settings']) {
    await idb.clear(store);
  }
  host.individuals = [];
  host.confirmClear = false;
  host.storageInfo = '0 MB used';
}
