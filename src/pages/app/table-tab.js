/**
 * Table tab — sub-tab switcher for traits/genes tables.
 * @module pages/app/table-tab
 */

import { html } from 'hybrids';

/** @param {object} host */
export function tableTab(host) {
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
