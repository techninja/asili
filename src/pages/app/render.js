/**
 * Beta view render sections — individual selector, tabs, content areas.
 * @module pages/app/beta-render
 */

import { html } from 'hybrids';
import { heroContent } from './hero.js';
import { demoBanner } from './demo-banner.js';
import '#pages/app/report.js';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
// @ts-ignore
import '#organisms/data-table/data-table.js';
// @ts-ignore
import '#organisms/explore-grid/explore-grid.js';
import '#organisms/gene-table/gene-table.js';

export { uploadPanel } from './upload-panel.js';

/** @param {object} host @param {Array<object>} list @param {Function} switchFn */
export function individualSelector(host, list, switchFn) {
  // Single individual: compact inline display
  if (list.length === 1) {
    const ind = list[0];
    return html`<span class="app-view__ind-single"
      >${ind.emoji}
      ${ind.name}${ind.isDemo ? html` <span class="demo-badge">Demo</span>` : html``}</span
    >`;
  }
  return html`
    <div class="app-view__selector">
      ${list.map(
        (ind) => html`
          <button
            class="app-view__ind-btn ${ind.id === host.activeId ? 'app-view__ind-btn--active' : ''}"
            onclick="${(h) => {
              h.showUpload = false;
              switchFn(h, ind.id);
            }}"
          >
            ${ind.hasImputed ? '⭐' : ''} ${ind.emoji}
            ${ind.name}${ind.isDemo ? html` <span class="demo-badge">Demo</span>` : html``}
          </button>
        `,
      )}
    </div>
  `;
}

const TABS = [
  { id: 'traits', label: 'Traits', icon: 'grid' },
  { id: 'explore', label: 'Genes', icon: 'dna' },
  { id: 'table', label: 'Table', icon: 'list' },
  { id: 'report', label: 'Report', icon: 'chart-pie' },
];

/** @param {object} host */
export function appSubHeader(host) {
  return html`
    <div class="app-layout__sub-header">
      <div class="app-layout__sub-header-inner app-view__tabs">
        ${TABS.map(
          (t) => html`
            <button
              class="app-view__tab ${host.activeTab === t.id ? 'app-view__tab--active' : ''}"
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
    ${host.isDemo ? demoBanner() : html``} ${host.activeTab === 'traits' ? traitsTab(host) : html``}
    ${host.activeTab === 'explore' ? html`<explore-grid></explore-grid>` : html``}
    ${host.activeTab === 'table' ? tableTab(host) : html``}
    ${host.activeTab === 'report'
      ? html`<report-content
          resultCount="${host.resultCount}"
          switchEpoch="${host._switchEpoch}"
        ></report-content>`
      : html``}
  `;
}

/** Demo mode banner — shown when viewing pre-loaded sample data. */

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
  const sub = host._tableSub || 'traits';
  return html`
    <div class="table-tab">
      <div class="table-tab__subs">
        <button
          class="table-tab__sub ${sub === 'traits' ? 'table-tab__sub--active' : ''}"
          onclick="${(h) => {
            h._tableSub = 'traits';
          }}"
        >
          Traits
        </button>
        <button
          class="table-tab__sub ${sub === 'genes' ? 'table-tab__sub--active' : ''}"
          onclick="${(h) => {
            h._tableSub = 'genes';
          }}"
        >
          Genes
        </button>
      </div>
      ${sub === 'traits'
        ? html`<data-table
            resultCount="${host.resultCount}"
            switchEpoch="${host._switchEpoch}"
          ></data-table>`
        : html`<gene-table></gene-table>`}
    </div>
  `;
}
