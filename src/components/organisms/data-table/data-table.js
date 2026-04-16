/**
 * Data table — traits × individuals with sortable, configurable columns.
 * @module components/organisms/data-table
 */

import { html, define } from 'hybrids';
import { getTraitList } from '#utils/manifest.js';
import { results, getActiveId } from '#pages/beta/results-store.js';
import { buildRows, toggleSort, sortIcon, applySort, loadAll } from './table-helpers.js';

const COLS = [
  { id: 'name', label: 'Trait', title: 'Trait name', on: true, required: true },
  { id: 'percentile', label: 'Pctl', title: 'Population percentile (0-100)', on: true },
  { id: 'zScore', label: 'Z', title: 'Standard deviations from average', on: true },
  { id: 'value', label: 'Value', title: 'Predicted measurement value', on: true },
  { id: 'confidence', label: 'Conf', title: 'Data confidence level', on: false },
  { id: 'coverage', label: 'Cov%', title: 'Variant coverage percentage', on: false },
  { id: 'bestPGS', label: 'PGS', title: 'Best polygenic score used', on: false },
  { id: 'matches', label: 'Matches', title: 'Total variant matches', on: false },
];

const KEY = 'asili_tableCols';

export default define({
  tag: 'data-table',
  resultCount: 0,
  showAll: false,
  sorts: { value: /** @type {Array} */ ([]), connect: () => {} },
  columns: {
    value: /** @type {Array} */ ([]),
    connect(host) {
      const s = localStorage.getItem(KEY);
      host.columns = s ? JSON.parse(s) : COLS.map((c) => ({ ...c }));
    },
  },
  traits: {
    value: /** @type {Array} */ ([]),
    connect(host, _key, invalidate) {
      getTraitList().then((l) => {
        host.traits = l;
        invalidate();
      });
    },
  },
  allResults: {
    value: /** @type {Array} */ ([]),
    connect(host, _key, invalidate) {
      loadAll(host).then(invalidate);
    },
  },
  render: {
    value: (host) => {
      void host.resultCount;
      const active = host.columns.filter((c) => c.on);
      const src = host.showAll ? host.allResults : [{ id: getActiveId(), results }];
      const sorted = applySort(buildRows(host.traits, src), host.sorts);
      return html`
        <div class="data-table">
          <div class="data-table__controls">
            <label class="trait-grid__switch">
              <input
                type="checkbox"
                checked="${host.showAll}"
                onchange="${(h, e) => {
                  h.showAll = e.target.checked;
                }}"
              />
              <span class="trait-grid__switch-track"></span>
              All individuals
            </label>
            <fieldset class="data-table__fields">
              <legend>Customize Columns</legend>
              ${host.columns
                .filter((c) => !c.required)
                .map(
                  (c) => html`
                    <label title="${c.title}">
                      <input
                        type="checkbox"
                        checked="${c.on}"
                        onchange="${(h, e) => toggleColById(h, c.id, e)}"
                      />
                      ${c.label}
                    </label>
                  `,
                )}
            </fieldset>
          </div>
          <div class="data-table__scroll">
            <table class="data-table__table">
              <thead>
                <tr>
                  ${host.showAll ? html`<th>Individual</th>` : html``}
                  ${active.map(
                    (c) => html`
                      <th
                        class="data-table__sortable"
                        title="${c.title}"
                        onclick="${(h) => toggleSort(h, c.id)}"
                      >
                        ${c.label}${sortIcon(host.sorts, c.id)}
                      </th>
                    `,
                  )}
                </tr>
              </thead>
              <tbody>
                ${sorted.map(
                  (r) =>
                    html`<tr>
                      ${host.showAll ? html`<td>${r._ind}</td>` : html``}
                      ${active.map((c) => html`<td>${r[c.id] ?? '\u2014'}</td>`)}
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host @param {string} colId @param {Event} e */
function toggleColById(host, colId, e) {
  const next = host.columns.map((c) =>
    c.id === colId ? { ...c, on: /** @type {HTMLInputElement} */ (e.target).checked } : c,
  );
  host.columns = next;
  localStorage.setItem(KEY, JSON.stringify(next));
}
