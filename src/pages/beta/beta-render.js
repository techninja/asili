/**
 * Beta view render sections — individual selector, tabs, content areas.
 * @module pages/beta/beta-render
 */

import { html } from 'hybrids';
import { handleFile, handleSetup } from './beta-sections.js';
import { scoringBanner } from './scoring-banner.js';
import { heroContent } from './beta-hero.js';
import '#pages/beta/beta-report.js';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
// @ts-ignore
import '#organisms/data-table/data-table.js';

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
    </div>
  `;
}

/** Upload panel — rendered between header and main */
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

const TABS = [
  { id: 'traits', label: 'Traits', icon: 'grid' },
  { id: 'table', label: 'Table', icon: 'list' },
  { id: 'report', label: 'Report', icon: 'chart-pie' },
];

/** @param {object} host */
export function appContent(host) {
  return html`
    ${scoringBanner(host)}
    <div class="beta-view__tabs">
      ${TABS.map(
        (t) => html`
          <button
            class="beta-view__tab ${host.activeTab === t.id ? 'beta-view__tab--active' : ''}"
            onclick="${(h) => {
              h.activeTab = t.id;
            }}"
          >
            <app-icon name="${t.icon}"></app-icon> ${t.label}
          </button>
        `,
      )}
    </div>
    ${host.activeTab === 'traits' ? traitsTab(host) : html``}
    ${host.activeTab === 'table' ? tableTab(host) : html``}
    ${host.activeTab === 'report'
      ? html`<report-content
          resultCount="${host.resultCount}"
          switchEpoch="${host._switchEpoch}"
        ></report-content>`
      : html``}
  `;
}

/** @param {object} host @param {Function} cancelFn */
export function uploadContent(host, cancelFn) {
  return heroContent(host, cancelFn);
}

/** @param {object} host */
function traitsTab(host) {
  return html`
    <trait-grid
      resultCount="${host.resultCount}"
      switchEpoch="${host._switchEpoch}"
      scoring="${host.scoringStatus === 'scoring'}"
    ></trait-grid>
  `;
}

/** @param {object} host */
function tableTab(host) {
  return html`
    <data-table resultCount="${host.resultCount}" switchEpoch="${host._switchEpoch}"></data-table>
  `;
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
