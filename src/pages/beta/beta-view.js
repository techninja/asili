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
import { handleSwitch, closeOrToggleUpload, cancelSetup } from './beta-actions.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';
// @ts-ignore
import '#organisms/settings-drawer/settings-drawer.js';

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
  activeTab: 'traits',
  _variants: { value: [], connect: () => {} },
  _manifest: { value: '', connect: () => {} },
  _init: {
    value: false,
    connect: (host, _key, invalidate) => {
      initApp(host).then(() => {
        invalidate();
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
      return () => window.removeEventListener('asili-individuals-changed', refresh);
    },
  },
  render: {
    value: (host) => {
      const list = Array.isArray(host.individuals) ? host.individuals : [];
      const hasData = list.length > 0;
      const showPanel = hasData && (host.showUpload || host.parseStatus);
      return html`
        <div class="beta-view">
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
          ${showPanel || host.closingUpload ? uploadPanel(host, cancelSetup) : html``}
          <main class="beta-view__main">
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
        </div>
      `;
    },
    shadow: false,
  },
});

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
