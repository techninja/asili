/**
 * Beta app view — individual selector + trait grid + upload.
 * Single-page app: switch individual context, scores update in place.
 * @module pages/beta
 */

import { html, define, router } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';
// @ts-ignore
import '../../components/molecules/upload-zone/upload-zone.js';
// @ts-ignore
import '../../components/molecules/individual-setup/individual-setup.js';
// @ts-ignore
import '../../components/organisms/trait-grid/trait-grid.js';
import { individualSelector, appContent, uploadContent } from './beta-render.js';
import { loadResults } from './results-store.js';
import { startScoring } from './scoring-controller.js';
import TraitDetailView from '../trait-detail/trait-detail-view.js';
import ReportView from '../report/report-view.js';
import SettingsView from '../settings/settings-view.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta', stack: [TraitDetailView, ReportView, SettingsView] },
  individuals: { value: [], connect: () => {} },
  activeId: '',
  resultCount: 0,
  parseStatus: { value: '', connect: () => {} },
  parsedCount: { value: 0, connect: () => {} },
  parsedFormat: { value: '', connect: () => {} },
  parsedFilename: { value: '', connect: () => {} },
  scoringStatus: { value: '', connect: () => {} },
  scoringTrait: { value: '', connect: () => {} },
  scoringCurrent: { value: 0, connect: () => {} },
  scoringTotal: { value: 0, connect: () => {} },
  showUpload: { value: false, connect: () => {} },
  _variants: { value: [], connect: () => {} },
  _init: {
    value: false,
    connect: (host, _key, invalidate) => {
      initApp(host).then(invalidate);
    },
  },
  render: {
    value: (host) => {
      const list = Array.isArray(host.individuals) ? host.individuals : [];
      const hasData = list.length > 0;
      return html`
        <div class="beta-view">
          <header class="beta-view__header">
            <a href="/" class="beta-view__logo">
              <img src="/logo.svg" alt="" class="beta-view__logo-img" /><span>asili</span>
            </a>
            <span class="beta-view__tag">beta</span>
            ${hasData ? individualSelector(host, list, switchIndividual) : html``}
            <a href="${router.url(SettingsView)}" class="beta-view__settings">⚙️</a>
          </header>
          <main class="beta-view__main">
            ${hasData ? appContent(host, cancelSetup) : uploadContent(host, cancelSetup)}
          </main>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host @param {string} id */
async function switchIndividual(host, id) {
  host.activeId = id;
  host.resultCount = 0;
  const count = await loadResults(id);
  host.resultCount = count;
  if (count === 0) startScoring(host, id);
}

/** @param {object} host */
async function initApp(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
  if (host.individuals.length > 0) {
    const id = host.activeId || host.individuals[0].id;
    await switchIndividual(host, id);
  }
}

/** @param {object} host */
function cancelSetup(host) {
  host.parseStatus = '';
  host.parsedCount = 0;
  host._variants = [];
  host.showUpload = false;
}
