/**
 * Beta view render sections — individual selector, content areas, inline upload.
 * @module pages/beta/beta-render
 */

import { html, router } from 'hybrids';
import { handleFile, handleSetup } from './beta-sections.js';
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
            ${ind.emoji} ${ind.name}
          </button>
        `,
      )}
      <button
        class="beta-view__ind-btn ${host.showUpload ? 'beta-view__ind-btn--active' : ''}"
        onclick="${(h) => {
          h.showUpload = !h.showUpload;
        }}"
      >
        + Add
      </button>
    </div>
  `;
}

/** @param {object} host @param {Function} cancelFn */
export function appContent(host, cancelFn) {
  return html`
    ${host.showUpload || host.parseStatus ? uploadInline(host, cancelFn) : html``}
    ${scoringBanner(host)}
    <div class="beta-view__actions">
      <a href="${router.url(ReportView)}" class="btn btn-ghost">📄 Report</a>
    </div>
    <trait-grid resultCount="${host.resultCount}"></trait-grid>
  `;
}

/** @param {object} host @param {Function} cancelFn */
export function uploadContent(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  return html`
    <h1 class="beta-view__title">Upload your DNA</h1>
    <p class="beta-view__sub">Your file stays on your device.</p>
    ${!isParsing && !isSetup
      ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>`
      : html``}
    ${isParsing ? parsingInline(host) : html``} ${isSetup ? setupInline(host, cancelFn) : html``}
  `;
}

/** @param {object} host @param {Function} cancelFn */
function uploadInline(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  return html`
    <div class="beta-view__upload-section">
      ${!isParsing && !isSetup
        ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>`
        : html``}
      ${isParsing ? parsingInline(host) : html``} ${isSetup ? setupInline(host, cancelFn) : html``}
    </div>
  `;
}

/** @param {object} host */
function scoringBanner(host) {
  if (host.scoringStatus === 'scoring')
    return html`<p class="beta-view__scoring">
      Scoring: ${host.scoringTrait} (${host.scoringCurrent + 1}/${host.scoringTotal})
    </p>`;
  if (host.scoringStatus === 'init')
    return html`<p class="beta-view__scoring">Initializing DuckDB…</p>`;
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
function setupInline(host, cancelFn) {
  return html`
    <individual-setup
      variantCount="${host.parsedCount}"
      format="${host.parsedFormat}"
      filename="${host.parsedFilename}"
      onsetup-complete="${handleSetup}"
      onsetup-cancel="${cancelFn}"
    ></individual-setup>
  `;
}
