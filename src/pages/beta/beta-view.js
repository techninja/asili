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
import { individualSelector, appSubHeader, appContent, uploadContent, uploadPanel } from './beta-render.js';
import { loadResults, clearResults } from './results-store.js';
import { initQueue, switchIndividual } from './scoring-controller.js';
import { handleSwitch, closeOrToggleUpload, cancelSetup } from './beta-actions.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';
// @ts-ignore
import '#organisms/settings-drawer/settings-drawer.js';
// @ts-ignore
import '#molecules/floating-bar/floating-bar.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta', stack: [TraitDetailView] },
  individuals: { value: [], connect: () => {} },
  activeId: '',
  resultCount: 0,
  _switchEpoch: 0,
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
  closingUpload: false,
  activeTab: {
    value: 'traits',
    observe(host, val) {
      sessionStorage.setItem('asili-source-tab', val);
    },
    connect(host) {
      const saved = sessionStorage.getItem('asili-source-tab');
      if (saved && ['traits', 'table', 'report'].includes(saved)) host.activeTab = saved;
    },
  },
  _variants: { value: [], connect: () => {} },
  _manifest: { value: '', connect: () => {} },
  _init: {
    value: false,
    connect: (host, _key, invalidate) => {
      initApp(host).then(() => {
        invalidate();
        if (sessionStorage.getItem('asili-open-upload')) {
          sessionStorage.removeItem('asili-open-upload');
          host.showUpload = true;
        }
        requestAnimationFrame(() => {
          if (host.activeId) switchIndividual(host, host.activeId);
        });
      });
      const refresh = () => {
        idb.getAll('individuals').then((list) => {
          host.individuals = list;
        });
      };
      window.addEventListener('asili-individuals-changed', refresh);
      const rescore = async (e) => {
        const id = e.detail;
        if (id === host.activeId) {
          await clearResults();
          host.resultCount = 0;
          host.scoringStatus = '';
          initQueue(host);
        } else {
          // Clear results for non-active individual (will score when switched to)
          const dl = await import('/packages/core/src/data-layer/create.js').then(m => m.getDataLayer());
          await dl.clearResults(id);
        }
      };
      window.addEventListener('asili-rescore', rescore);
      return () => {
        window.removeEventListener('asili-individuals-changed', refresh);
        window.removeEventListener('asili-rescore', rescore);
      };
    },
  },
  render: {
    value: (host) => {
      const list = Array.isArray(host.individuals) ? host.individuals : [];
      const hasData = list.length > 0;
      const showPanel = hasData && (host.showUpload || host.parseStatus);
      return html`
        <div class="app-layout">
          ${appHeader({
            badge: 'beta',
            onSettings: (h) => {
              h.showUpload = false;
              toggleSettings();
            },
            center: hasData ? individualSelector(host, list, handleSwitch) : html``,
            trailing: hasData
              ? html`<button
                  class="app-header__link ${showPanel ? 'app-header__link--active' : ''}"
                  onclick="${closeOrToggleUpload}"
                  title="Add individual"
                >
                  <app-icon name="user-plus"></app-icon>
                </button>`
              : html``,
          })}
          ${hasData ? appSubHeader(host) : html``}
          ${showPanel || host.closingUpload ? uploadPanel(host, cancelSetup) : html``}
          <main class="app-layout__content">
            ${hasData ? appContent(host) : uploadContent(host, cancelSetup)}
          </main>
          ${appFooter()}
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
          <floating-bar
            onfocus-mode="${openScoringScreen}"
          ></floating-bar>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host */
function openScoringScreen(host) {
  host.scoringScreen = true;
  document.documentElement.requestFullscreen?.().catch(() => {});
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
