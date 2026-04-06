/**
 * Beta view section renderers — upload, parsing, setup, done, error states.
 * @module pages/beta/beta-sections
 */

import { html, router } from 'hybrids';
import { handleFileSelected, handleSetupComplete, resumeIndividual } from './upload-handler.js';
import { clearResults } from './results-store.js';
import ReportView from '../report/report-view.js';

/** @param {object} host */
export function renderState(host) {
  switch (host.parseStatus) {
    case '':
      return uploadSection(host);
    case 'parsing':
      return parsingSection(host);
    case 'setup':
      return setupSection(host);
    case 'done':
      return doneSection(host);
    case 'error':
      return errorSection(host);
    default:
      return html``;
  }
}

/** @param {object} host */
function uploadSection(host) {
  return html`
    <h1 class="beta-view__title">Upload your DNA</h1>
    <p class="beta-view__sub">Your file stays on your device.</p>
    <upload-zone onfile-selected="${handleFileSelected}"></upload-zone>
    ${host.savedIndividuals.length > 0
      ? html` <div class="beta-view__saved">
          <p class="beta-view__saved-label">Or continue with:</p>
          ${host.savedIndividuals.map(
            (ind) => html`
              <button class="btn btn-ghost" onclick="${(h) => resumeIndividual(h, ind)}">
                ${ind.emoji} ${ind.name} (${ind.variantCount?.toLocaleString()} variants)
              </button>
            `,
          )}
        </div>`
      : html``}
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
function setupSection(host) {
  return html`
    <h1 class="beta-view__title">Who is this?</h1>
    <individual-setup
      variantCount="${host.parsedCount}"
      format="${host.parsedFormat}"
      onsetup-complete="${handleSetupComplete}"
    ></individual-setup>
  `;
}

/** @param {object} host */
function doneSection(host) {
  return html`
    <div class="beta-view__result">
      <h2>${host.individualName} — ${host.parsedCount.toLocaleString()} variants</h2>
      ${scoringBanner(host)}
      <div class="beta-view__actions">
        <a href="${router.url(ReportView)}" class="btn btn-ghost">📄 Report</a>
        <button class="btn btn-ghost" onclick="${resetUpload}">+ Upload another</button>
      </div>
    </div>
    <trait-grid resultCount="${host.resultCount}"></trait-grid>
  `;
}

/** @param {object} host */
function scoringBanner(host) {
  if (host.scoringStatus === 'init')
    return html`<p class="beta-view__scoring">Initializing DuckDB…</p>`;
  if (host.scoringStatus === 'scoring') {
    return html`<p class="beta-view__scoring">
      Scoring: ${host.scoringTrait} (${host.scoringCurrent + 1}/${host.scoringTotal})
    </p>`;
  }
  if (host.scoringStatus === 'done')
    return html`<p class="beta-view__scoring beta-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  if (host.scoringStatus === 'error')
    return html`<p class="beta-view__scoring beta-view__scoring--error">❌ ${host.parseError}</p>`;
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
export function resetUpload(host) {
  host.parseStatus = '';
  host.parseError = '';
  host.parsedCount = 0;
  host.scoringStatus = '';
  host.resultCount = 0;
  host._variants = [];
  clearResults();
}
