/**
 * Data table — traits × individuals with sortable, configurable columns.
 * @module components/organisms/data-table
 */

import { html, define } from 'hybrids';
import { getTraitList } from '#utils/manifest.js';
import { results, getActiveId } from '#pages/beta/results-store.js';
import { buildRows, toggleSort, applySort, loadAll } from './table-helpers.js';
import { COLS, COL_MAP } from './table-columns.js';
import { renderColGroups, tableMarkup } from './table-render.js';
import { get as sGet, set as sSet } from '#utils/storage.js';

const meta = (id) => COL_MAP.get(id) || {};

export default define({
  tag: 'data-table',
  resultCount: 0,
  switchEpoch: 0,
  showAll: false,
  sorts: { value: /** @type {Array} */ ([]), connect: () => {} },
  columns: {
    value: /** @type {Array} */ ([]),
    connect(host) {
      const s = sGet('tableCols');
      if (!s) {
        host.columns = COLS.map((c) => ({ ...c }));
        return;
      }
      const saved = JSON.parse(s);
      const ids = new Set(saved.map((c) => c.id));
      const merged = saved
        .map((c) => ({ ...c, ...meta(c.id), on: c.on }))
        .concat(COLS.filter((c) => !ids.has(c.id)).map((c) => ({ ...c })));
      host.columns = merged;
      sSet('tableCols', JSON.stringify(merged));
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
      void host.switchEpoch;
      const active = host.columns.filter((c) => c.on);
      const src = host.showAll ? host.allResults : [{ id: getActiveId(), results }];
      const sorted = applySort(buildRows(host.traits, src), host.sorts);
      const toggleable = host.columns.filter((c) => !c.required);
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
              <span class="trait-grid__switch-track"></span> All individuals
            </label>
          </div>
          <fieldset class="data-table__fields">
            <legend>Columns</legend>
            <div class="data-table__col-groups">${renderColGroups(toggleable, toggleCol)}</div>
          </fieldset>
          ${tableMarkup(host, active, sorted, toggleSort)}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host @param {string} colId @param {Event} e */
function toggleCol(host, colId, e) {
  const next = host.columns.map((c) =>
    c.id === colId ? { ...c, on: /** @type {HTMLInputElement} */ (e.target).checked } : c,
  );
  host.columns = next;
  sSet('tableCols', JSON.stringify(next));
}
