/**
 * Beta app view — individual selector + trait grid + upload.
 * Single-page app: switch individual context, scores update in place.
 * @module pages/beta
 */

import { html, define, router } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';
// @ts-ignore
import '#molecules/upload-zone/upload-zone.js';
// @ts-ignore
import '#molecules/individual-setup/individual-setup.js';
// @ts-ignore
import '#organisms/trait-grid/trait-grid.js';
// @ts-ignore
import '#organisms/scoring-screen/scoring-screen.js';
import { individualSelector, appContent, uploadContent, uploadPanel } from './beta-render.js';
import { loadResults } from './results-store.js';
import { initQueue, switchIndividual } from './scoring-controller.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';
import ReportView from '#pages/report/report-view.js';
import SettingsView from '#pages/settings/settings-view.js';

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
  parseError: { value: '', connect: () => {} },
  scoringStatus: { value: '', connect: () => {} },
  scoringTrait: { value: '', connect: () => {} },
  scoringCurrent: { value: 0, connect: () => {} },
  scoringTotal: { value: 0, connect: () => {} },
  scoringChrDone: { value: 0, connect: () => {} },
  scoringChrTotal: { value: 0, connect: () => {} },
  scoringIndividualCount: { value: 0, connect: () => {} },
  scoringCurrentId: { value: '', connect: () => {} },
  _scoringRate: { value: 0, connect: () => {} },
  _scoringEta: { value: 0, connect: () => {} },
  scoringTick: {
    value: 0,
    connect: (host) => {
      const iv = setInterval(() => {
        if (host.scoringStatus === 'scoring') host.scoringTick++;
      }, 2000);
      return () => clearInterval(iv);
    },
  },
  scoringScreen: { value: false, connect: () => {} },
  showUpload: { value: false, connect: () => {} },
  _variants: { value: [], connect: () => {} },
  _manifest: { value: '', connect: () => {} },
  _init: {
    value: false,
    connect: (host, _key, invalidate) => {
      initApp(host).then(() => {
        invalidate();
        // Trigger switchIndividual after render — same path as user click
        requestAnimationFrame(() => {
          if (host.activeId) switchIndividual(host, host.activeId);
        });
      });
    },
  },
  render: {
    value: (host) => {
      const list = Array.isArray(host.individuals) ? host.individuals : [];
      const hasData = list.length > 0;
      const showPanel = hasData && (host.showUpload || host.parseStatus);
      return html`
        <div class="beta-view">
          <header class="beta-view__header">
            <div class="beta-view__header-top">
              <a href="/" class="beta-view__logo">
                <img src="/logo.svg" alt="" class="beta-view__logo-img" /><span>asili</span>
              </a>
              <span class="beta-view__tag">beta</span>
              ${hasData ? individualSelector(host, list, handleSwitch) : html``}
              <a href="${router.url(SettingsView)}" class="beta-view__settings">⚙️</a>
            </div>
          </header>
          ${showPanel ? uploadPanel(host, cancelSetup) : html``}
          <main class="beta-view__main">
            ${hasData ? appContent(host) : uploadContent(host, cancelSetup)}
          </main>
          <scoring-screen
            visible="${host.scoringScreen}"
            traitName="${host.scoringTrait}"
            done="${host.scoringCurrent}"
            total="${host.scoringTotal}"
            chrDone="${host.scoringChrDone}"
            chrTotal="${host.scoringChrTotal}"
            rate="${host._scoringRate}"
            eta="${host._scoringEta}"
          ></scoring-screen>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host @param {string} id */
async function handleSwitch(host, id) {
  await switchIndividual(host, id);
}

/** @param {object} host */
async function initApp(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
  if (host.individuals.length > 0) {
    const id = host.activeId || host.individuals[0].id;
    host.activeId = id;
    // Pre-load results into cache so first render has data
    host.resultCount = await loadResults(id);
    await initQueue(host);
  }
}

/** @param {object} host */
function cancelSetup(host) {
  host.parseStatus = '';
  host.parsedCount = 0;
  host._variants = [];
  host._manifest = '';
  host.parseError = '';
  host.showUpload = false;
}
