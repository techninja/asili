/**
 * Beta view — upload → setup → score → trait grid.
 * Restores previous session from IndexedDB on load.
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
import { renderState } from './beta-sections.js';
import TraitDetailView from '../trait-detail/trait-detail-view.js';
import ReportView from '../report/report-view.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta', stack: [TraitDetailView, ReportView] },
  parseStatus: '',
  parseError: '',
  parsedCount: 0,
  parsedFormat: '',
  individualId: '',
  individualName: '',
  scoringStatus: '',
  scoringCurrent: 0,
  scoringTotal: 0,
  scoringTrait: '',
  resultCount: 0,
  savedIndividuals: {
    value: [],
    connect: (host, _key, invalidate) => {
      loadSaved(host).then(invalidate);
    },
  },
  _variants: { value: [], connect: () => {} },
  render: {
    value: (host) => html`
      <div class="beta-view">
        <header class="beta-view__header">
          <a href="/" class="beta-view__logo">
            <img src="/logo.svg" alt="" class="beta-view__logo-img" />
            <span>asili</span>
          </a>
          <span class="beta-view__tag">beta</span>
        </header>
        <main class="beta-view__main">${renderState(host)}</main>
      </div>
    `,
    shadow: false,
  },
});

/** @param {object} host */
async function loadSaved(host) {
  try {
    await idb.openDB();
    host.savedIndividuals = await idb.getAll('individuals');
  } catch {
    /* first visit */
  }
}
