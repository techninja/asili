/**
 * Report tab content — radar chart, top/bottom traits, print button.
 * @module pages/beta/beta-report
 */

import { html } from 'hybrids';
// @ts-ignore
import '#organisms/radar-chart/radar-chart.js';
import { results, getActiveId } from './results-store.js';
import { buildCategorySummary } from '#utils/categories.js';
import { getTraitList } from '#utils/manifest.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import * as idb from '/packages/core/src/data-layer/idb.js';

/** @type {Array<object>} */
let traitCache = [];
getTraitList().then((list) => {
  traitCache = list;
});

/** @type {Map<string, object>} */
const indMap = new Map();
idb
  .openDB()
  .then(() => idb.getAll('individuals'))
  .then((inds) => {
    for (const ind of inds) indMap.set(ind.id, ind);
  });

/** @param {object} _host */
export function reportContent(_host) {
  if (!traitCache.length) return html`<p>Loading traits…</p>`;
  const activeId = getActiveId();
  const ind = indMap.get(activeId);
  const name = ind ? `${ind.emoji || ''} ${ind.name || ''}`.trim() : '';
  const cats = buildCategorySummary(results, traitCache);
  const scored = traitCache.filter((t) => results[t.trait_id]);
  const sorted = scored
    .filter((t) => results[t.trait_id]?.percentile !== null)
    .sort(
      (a, b) => (results[b.trait_id]?.percentile || 0) - (results[a.trait_id]?.percentile || 0),
    );
  const elevated = sorted.slice(0, 5);
  const low = [...sorted].reverse().slice(0, 5);

  return html`
    <div class="report-tab">
      <div class="report-tab__header">
        <h2>Genomic Report${name ? ` for ${name}` : ''}</h2>
        <button class="btn btn-ghost btn-sm" onclick="${() => window.print()}">
          <app-icon name="document"></app-icon> Print
        </button>
      </div>
      <section class="report-tab__section">
        <h3>Category Overview</h3>
        <radar-chart categories="${JSON.stringify(cats)}"></radar-chart>
        <p class="report-tab__meta">${scored.length} traits scored</p>
      </section>
      ${elevated.length > 0
        ? html`
            <section class="report-tab__section">
              <h3>Top Elevated</h3>
              ${traitTable(elevated)}
            </section>
          `
        : html``}
      ${low.length > 0
        ? html`
            <section class="report-tab__section">
              <h3>Below Average</h3>
              ${traitTable(low)}
            </section>
          `
        : html``}
      <p class="report-tab__disclaimer">
        This is not a medical diagnosis. Consult a healthcare professional.
      </p>
    </div>
  `;
}

/** @param {Array<object>} traits */
function traitTable(traits) {
  return html`
    <table class="report-tab__table">
      <thead>
        <tr>
          <th>Trait</th>
          <th>Percentile</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${traits.map((t) => {
          const r = results[t.trait_id];
          const fmt = r?.value !== null ? formatTraitValue(r.value, t.unit) : null;
          return html`<tr>
            <td>${t.emoji || '🧬'} ${t.name}</td>
            <td>${Math.round(r?.percentile || 0)}th</td>
            <td>${fmt?.display || '—'}</td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}
