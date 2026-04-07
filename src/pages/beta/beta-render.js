/**
 * Beta view render sections — individual selector, content areas, upload panel.
 * @module pages/beta/beta-render
 */

import { html, router } from 'hybrids';
import { handleFile, handleSetup } from './beta-sections.js';
import { handleStopScoring } from './scoring-controller.js';
import ReportView from '#pages/report/report-view.js';

/** @param {object} host @param {Array<object>} list @param {Function} switchFn */
export function individualSelector(host, list, switchFn) {
  return html`
    <div class="beta-view__selector">
      ${list.map(
        (ind) => html`
          <button
            class="beta-view__ind-btn ${ind.id === host.activeId
              ? 'beta-view__ind-btn--active'
              : ''}"
            onclick="${(h) => {
              h.showUpload = false;
              switchFn(h, ind.id);
            }}"
          >
            ${ind.hasImputed ? '⭐' : ''} ${ind.emoji} ${ind.name}
          </button>
        `,
      )}
      <button
        class="beta-view__ind-btn beta-view__ind-btn--add ${host.showUpload || host.parseStatus
          ? 'beta-view__ind-btn--add-active'
          : ''}"
        onclick="${(h) => {
          h.showUpload = !h.showUpload;
        }}"
      >
        + Add
      </button>
    </div>
  `;
}

/** Upload panel — rendered inside header, visually connected to + Add tab */
export function uploadPanel(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  const isError = host.parseStatus === 'error';
  return html`
    <div class="beta-view__upload-panel">
      ${!isParsing && !isSetup && !isError
        ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>`
        : html``}
      ${isParsing ? parsingInline(host) : html``} ${isSetup ? setupInline(host, cancelFn) : html``}
      ${isError ? errorInline(host, cancelFn) : html``}
    </div>
  `;
}

/** @param {object} host */
export function appContent(host) {
  return html`
    ${scoringBanner(host)}
    <div class="beta-view__actions">
      <a href="${router.url(ReportView)}" class="btn btn-ghost">📄 Report</a>
    </div>
    <trait-grid
      resultCount="${host.resultCount}"
      scoring="${host.scoringStatus === 'scoring'}"
    ></trait-grid>
  `;
}

/** @param {object} host @param {Function} cancelFn */
export function uploadContent(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  const isError = host.parseStatus === 'error';
  return html`
    <h1 class="beta-view__title">Upload your DNA</h1>
    <p class="beta-view__sub">Your file stays on your device.</p>
    ${!isParsing && !isSetup && !isError
      ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>`
      : html``}
    ${isParsing ? parsingInline(host) : html``} ${isSetup ? setupInline(host, cancelFn) : html``}
    ${isError ? errorInline(host, cancelFn) : html``}
  `;
}

/** @param {object} host */
function scoringBanner(host) {
  if (host.scoringStatus === 'scoring')
    return html`<p class="beta-view__scoring">
      Scoring: ${host.scoringTrait} (${host.scoringCurrent + 1}/${host.scoringTotal})
      <button class="btn btn-ghost btn-sm" onclick="${handleStopScoring}">⏹ Stop</button>
    </p>`;
  if (host.scoringStatus === 'init')
    return html`<p class="beta-view__scoring">Initializing DuckDB…</p>`;
  if (host.scoringStatus === 'done')
    return html`<p class="beta-view__scoring beta-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  return html``;
}

/** @param {object} host */
function parsingInline(host) {
  return html`
    <div class="beta-view__status">
      <span class="beta-view__spinner">🧬</span>
      <p>
        ${host.parsedCount > 0 ? `${host.parsedCount.toLocaleString()} variants` : 'Reading file…'}
      </p>
    </div>
  `;
}

/** @param {object} host @param {Function} cancelFn */
function errorInline(host, cancelFn) {
  return html`
    <div class="beta-view__error">
      <p class="beta-view__error-icon">❌</p>
      <p class="beta-view__error-msg">${host.parseError}</p>
      <button class="btn btn-ghost" onclick="${cancelFn}">Try again</button>
    </div>
  `;
}

/** @param {object} host @param {Function} cancelFn */
function setupInline(host, cancelFn) {
  return html`
    <individual-setup
      variantCount="${host.parsedCount}"
      format="${host.parsedFormat}"
      filename="${host.parsedFilename}"
      manifest="${host._manifest || ''}"
      onsetup-complete="${handleSetup}"
      onsetup-cancel="${cancelFn}"
    ></individual-setup>
  `;
}
