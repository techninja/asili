/**
 * Settings view — individual management, storage, data export/import.
 * @module pages/settings
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#molecules/individual-list/individual-list.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { getScoringSettings } from '#utils/queue-settings.js';
import { storageSection, scoringSection, dangerSection } from './settings-sections.js';
import {
  handleMemoryChange,
  handleWorkerChange,
  handleAutoScoreChange,
  handleDelete,
  handleUpgrade,
  doClearAll,
} from './settings-handlers.js';

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
            Asili
            v${
              /** @type {HTMLMetaElement|null} */ (
                document.querySelector('meta[name="app-version"]')
              )?.content || '?'
            }
            · Privacy-first · Your data never leaves this device
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
