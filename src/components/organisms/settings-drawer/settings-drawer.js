/**
 * Settings drawer — slides down from header as an overlay.
 * @module components/organisms/settings-drawer
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#molecules/individual-list/individual-list.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { resetQueue } from '#utils/scoring-queue.js';
import { clearFamilyCache } from '#organisms/trait-grid/render-card.js';

export default define({
  tag: 'settings-drawer',
  open: false,
  individuals: { value: /** @type {Array} */ ([]), connect: () => {} },
  storageInfo: '',
  _loaded: {
    value: false,
    observe(host, _, last) {
      if (host.open && !last) loadData(host);
    },
  },
  render: {
    value: ({ open, individuals, storageInfo }) => {
      if (!open) return html``;
      return html`
        <div class="settings-drawer__backdrop" onclick="${close}"></div>
        <div class="settings-drawer">
          <div class="settings-drawer__header">
            <h2>Settings</h2>
            <button class="settings-drawer__close" onclick="${close}">
              <app-icon name="x"></app-icon>
            </button>
          </div>
          <div class="settings-drawer__body">
            <section class="settings-drawer__section">
              <h3>Individuals</h3>
              <individual-list
                individuals="${JSON.stringify(individuals)}"
                ondelete-individual="${handleDelete}"
              ></individual-list>
            </section>
            <section class="settings-drawer__section">
              <h3>Storage</h3>
              <p class="settings-drawer__meta">${storageInfo || 'Calculating…'}</p>
            </section>
            <section class="settings-drawer__section">
              <h3>Danger Zone</h3>
              <button class="btn btn-danger" onclick="${doClearAll}">Clear All Data</button>
            </section>
            <section class="settings-drawer__section">
              <p class="settings-drawer__meta">
                Asili v1.0 · Privacy-first · Your data never leaves this device
              </p>
            </section>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host */
function close(host) {
  host.open = false;
}

/** @param {object} host */
async function loadData(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
  const est = await navigator.storage?.estimate?.();
  if (est) {
    const used = (est.usage / 1024 / 1024).toFixed(1);
    const quota = (est.quota / 1024 / 1024 / 1024).toFixed(1);
    host.storageInfo = `${used} MB used of ${quota} GB available`;
  }
}

/** @param {object} host */
async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** @param {object} host */
async function doClearAll(host) {
  await resetQueue();
  clearFamilyCache();
  localStorage.removeItem('asili_activeId');
  localStorage.removeItem('asili_gridPrefs');
  localStorage.removeItem('asili_paused');
  await idb.openDB();
  for (const s of ['individuals', 'variants', 'results', 'settings']) {
    await idb.clear(s);
  }
  window.location.href = '/';
}
