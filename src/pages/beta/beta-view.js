/**
 * Beta view — upload → parse → score → trait grid with results.
 * @module pages/beta
 */

import { html, define, store, router } from 'hybrids';
import AppState from '../../store/AppState.js';
// @ts-ignore — side-effect imports for web component registration
import '../../components/molecules/upload-zone/upload-zone.js';
// @ts-ignore
import '../../components/atoms/confidence-badge/confidence-badge.js';
// @ts-ignore
import '../../components/organisms/trait-grid/trait-grid.js';
import { handleFileSelected } from './upload-handler.js';
import { clearResults } from './results-store.js';
import TraitDetailView from '../trait-detail/trait-detail-view.js';
import ReportView from '../report/report-view.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta', stack: [TraitDetailView, ReportView] },
  state: store(AppState),
  parseStatus: '',
  parseError: '',
  parsedCount: 0,
  parsedFormat: '',
  individualName: '',
  scoringStatus: '',
  scoringCurrent: 0,
  scoringTotal: 0,
  scoringTrait: '',
  resultCount: 0,
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
        <main class="beta-view__main">
          ${host.parseStatus === ''
            ? uploadSection()
            : host.parseStatus === 'parsing'
              ? parsingSection(host)
              : host.parseStatus === 'done'
                ? doneSection(host)
                : errorSection(host)}
        </main>
      </div>
    `,
    shadow: false,
  },
});

/** Upload prompt */
function uploadSection() {
  return html`
    <h1 class="beta-view__title">Upload your DNA</h1>
    <p class="beta-view__sub">Your file stays on your device.</p>
    <upload-zone onfile-selected="${handleFileSelected}"></upload-zone>
  `;
}

/** @param {object} host */
function parsingSection(host) {
  return html`
    <div class="beta-view__status">
      <span class="beta-view__spinner">🧬</span>
      <p>Parsing ${host.parsedFormat || 'DNA'} file…</p>
      <p class="beta-view__count">${host.parsedCount.toLocaleString()} variants</p>
    </div>
  `;
}

/** @param {object} host */
function doneSection(host) {
  return html`
    <div class="beta-view__result">
      <h2>${host.individualName} — ${host.parsedCount.toLocaleString()} variants</h2>
      ${scoringBanner(host)}
      <button class="btn btn-ghost" onclick="${resetUpload}">Upload another</button>
    </div>
    <trait-grid resultCount="${host.resultCount}"></trait-grid>
  `;
}

/** @param {object} host */
function scoringBanner(host) {
  if (host.scoringStatus === 'init') {
    return html`<p class="beta-view__scoring">Initializing DuckDB WASM…</p>`;
  }
  if (host.scoringStatus === 'scoring') {
    return html`<p class="beta-view__scoring">
      Scoring: ${host.scoringTrait} (${host.scoringCurrent + 1}/${host.scoringTotal})
    </p>`;
  }
  if (host.scoringStatus === 'done') {
    return html`<p class="beta-view__scoring beta-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  }
  if (host.scoringStatus === 'error') {
    return html`<p class="beta-view__scoring beta-view__scoring--error">❌ ${host.parseError}</p>`;
  }
  return html``;
}

/** @param {object} host */
function errorSection(host) {
  return html`
    <div class="beta-view__error">
      <span>❌</span>
      <p>${host.parseError}</p>
      <button class="btn btn-secondary" onclick="${resetUpload}">Try again</button>
    </div>
  `;
}

/** @param {object} host */
function resetUpload(host) {
  host.parseStatus = '';
  host.parseError = '';
  host.parsedCount = 0;
  host.scoringStatus = '';
  host.resultCount = 0;
  clearResults();
}
