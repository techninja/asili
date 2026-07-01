/** Gene table — sortable, column-configurable table of catalog genes. */

import { html, define } from 'hybrids';
import { getGeneList } from '#utils/gene-catalog.js';
import { getActiveId } from '#pages/app/results-store.js';
import { loadProfile } from '#utils/individual-profile.js';
import { ALL_COLS, cellValue, sortValue, isNumeric, colPicker } from './gene-table-columns.js';

export default define({
  tag: 'gene-table',
  genes: {
    value: /** @type {Array} */ ([]),
    connect(host, _key, invalidate) {
      getGeneList().then((list) => {
        host.genes = list;
        invalidate();
      });
    },
  },
  geneStats: {
    value: /** @type {object|null} */ (null),
    connect(host, _key, invalidate) {
      const id = getActiveId();
      if (id) {
        loadProfile(id).then((p) => {
          host.geneStats = p?.geneStats || null;
          invalidate();
        });
      }
    },
  },
  columns: {
    value: /** @type {Array} */ ([]),
    connect(host) {
      host.columns = ALL_COLS.map((c) => ({ ...c }));
    },
  },
  sortBy: 'chr',
  sortDir: 'asc',
  showColPicker: false,
  render: {
    value: (host) => {
      const activeCols = host.columns.filter((c) => c.on);
      const stats = host.geneStats;

      const sorted = [...host.genes].sort((a, b) => {
        const av = sortValue(a, host.sortBy, stats);
        const bv = sortValue(b, host.sortBy, stats);
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
        return host.sortDir === 'asc' ? cmp : -cmp;
      });

      return html`
        <div class="gene-table">
          <div class="gene-table__toolbar">
            <span class="gene-table__count">${host.genes.length} genes</span>
            <button
              class="gene-table__col-btn"
              onclick="${(h) => {
                h.showColPicker = !h.showColPicker;
              }}"
            >
              Columns
            </button>
          </div>
          ${host.showColPicker ? colPicker(host, html) : html``}
          <div class="gene-table__scroll">
            <table class="gene-table__table">
              <thead>
                <tr>
                  ${activeCols.map(
                    (col) => html`
                      <th
                        class="gene-table__th ${host.sortBy === col.id
                          ? 'gene-table__th--active'
                          : ''} ${isNumeric(col.id) ? 'gene-table__th--num' : ''}"
                        onclick="${(h) => {
                          if (h.sortBy === col.id) h.sortDir = h.sortDir === 'asc' ? 'desc' : 'asc';
                          else {
                            h.sortBy = col.id;
                            h.sortDir = isNumeric(col.id) ? 'desc' : 'asc';
                          }
                        }}"
                      >
                        ${col.label}${host.sortBy === col.id
                          ? host.sortDir === 'asc'
                            ? ' \u25B4'
                            : ' \u25BE'
                          : ''}
                      </th>
                    `,
                  )}
                </tr>
              </thead>
              <tbody>
                ${sorted.map(
                  (g) => html`
                    <tr
                      class="gene-table__row"
                      onclick="${() => {
                        window.history.pushState(null, '', '/gene/' + g.symbol);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}"
                    >
                      ${activeCols.map(
                        (col) => html`
                          <td
                            class="${isNumeric(col.id) ? 'gene-table__num' : ''} ${col.id ===
                            'symbol'
                              ? 'gene-table__symbol'
                              : ''}"
                          >
                            ${cellValue(g, col.id, stats)}
                          </td>
                        `,
                      )}
                    </tr>
                  `,
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
