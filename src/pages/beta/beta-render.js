/**
 * Beta view render sections — individual selector, tabs, content areas.
 * @module pages/beta/beta-render
 */

import { html } from 'hybrids';
import { heroContent } from './beta-hero.js';
import '#pages/beta/beta-report.js';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
// @ts-ignore
import '#organisms/data-table/data-table.js';

export { uploadPanel } from './beta-upload-panel.js';

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

const TABS = [
  { id: 'traits', label: 'Traits', icon: 'grid' },
  { id: 'table', label: 'Table', icon: 'list' },
  { id: 'report', label: 'Report', icon: 'chart-pie' },
];

/** @param {object} host */
export function appSubHeader(host) {
  return html`
    <div class="app-layout__sub-header">
      <div class="app-layout__sub-header-inner beta-view__tabs">
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
    </div>
  `;
}

/** @param {object} host */
export function appContent(host) {
  return html`
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

/**
 *
 */
function traitsTab(host) {
  return html`
    <trait-grid
      resultCount="${host.resultCount}"
      switchEpoch="${host._switchEpoch}"
      scoring="${host.scoringStatus === 'scoring'}"
    ></trait-grid>
  `;
}

/**
 *
 */
function tableTab(host) {
  return html`<data-table
    resultCount="${host.resultCount}"
    switchEpoch="${host._switchEpoch}"
  ></data-table>`;
}
