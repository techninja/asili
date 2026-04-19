/**
 * Data table render helpers — column groups, table markup, cell formatting.
 * @module components/organisms/data-table/table-render
 */

import { html, router } from 'hybrids';
import { sortDir } from './table-helpers.js';
import { GROUPS, fmtNum } from './table-columns.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';

const NUM_COLS = new Set(['pgsMatches', 'traitMatches', 'genotyped', 'imputed']);

/**
 *
 */
export function colGroup(g, cols, toggleFn) {
  const items = cols.filter((c) => c.group === g.id);
  if (!items.length) return html``;
  return html`
    <div class="data-table__col-group">
      <span class="data-table__group-label">${g.label}</span>
      ${items.map(
        (c) => html`
          <label title="${c.title}">
            <input type="checkbox" checked="${c.on}" onchange="${(h, e) => toggleFn(h, c.id, e)}" />
            ${c.fullLabel || c.label}
          </label>
        `,
      )}
    </div>
  `;
}

/**
 *
 */
export function renderColGroups(toggleable, toggleFn) {
  return GROUPS.map((g) => colGroup(g, toggleable, toggleFn));
}

/**
 *
 */
export function tableMarkup(host, active, sorted, toggleSort) {
  return html`
    <div class="data-table__scroll">
      <table class="data-table__table">
        <thead>
          <tr>
            ${host.showAll ? html`<th title="Individual name">Individual</th>` : html``}
            ${active.map(
              (c) => html`
                <th
                  class="data-table__sortable"
                  title="${c.title}"
                  onclick="${(h) => toggleSort(h, c.id)}"
                >
                  ${c.label}
                  ${sortDir(host.sorts, c.id) === 'asc'
                    ? html`<app-icon name="sort-asc" size="sm"></app-icon>`
                    : sortDir(host.sorts, c.id) === 'desc'
                      ? html`<app-icon name="sort-desc" size="sm"></app-icon>`
                      : html``}
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
                ${active.map((c) => html`<td title="${cellTitle(c, r)}">${cellContent(c, r)}</td>`)}
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
  `;
}

/**
 *
 */
function cellVal(c, r) {
  const v = r[c.id];
  if (v === null || v === undefined) return '\u2014';
  return NUM_COLS.has(c.id) ? fmtNum(v) : v;
}

/**
 *
 */
function cellContent(c, r) {
  const v = cellVal(c, r);
  if (c.id === 'name' && r._traitId) {
    const href = router.url(TraitDetailView, { traitId: r._traitId });
    return html`<a href="${href}" class="data-table__trait-link">${v}</a>`;
  }
  return v;
}

/**
 *
 */
function cellTitle(c, r) {
  const v = r[c.id];
  if (NUM_COLS.has(c.id) && typeof v === 'number') return `${c.title}: ${v.toLocaleString()}`;
  return c.title;
}
