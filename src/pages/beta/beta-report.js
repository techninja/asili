/**
 * Report tab component — summary stats, radar chart, trait rankings, data quality.
 * @module pages/beta/beta-report
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#organisms/radar-chart/radar-chart.js';
import { results, getActiveId } from './results-store.js';
import { buildCategorySummary } from '#utils/categories.js';
import { getTraitList } from '#utils/manifest.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { summarySection, categoryCards, qualitySection, traitTable } from './report-sections.js';
import { subscribe } from '#utils/queue-state.js';

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

export default define({
  tag: 'report-content',
  resultCount: 0,
  switchEpoch: 0,
  _tick: {
    value: 0,
    connect: (host, _key, invalidate) => {
      const unsub = subscribe(() => {
        host._tick++;
        invalidate();
      });
      return unsub;
    },
  },
  render: {
    value: (host) => {
      void host._tick;
      void host.resultCount;
      void host.switchEpoch;
      if (!traitCache.length) return html`<p>Loading traits…</p>`;
      const activeId = getActiveId();
      const ind = indMap.get(activeId);
      const name = ind ? `${ind.emoji || ''} ${ind.name || ''}`.trim() : '';
      const cats = buildCategorySummary(results, traitCache);
      const scored = traitCache.filter((t) => results[t.trait_id]?.percentile !== null);
      if (!scored.length) {
        return html`<div class="report-tab">
          <div class="report-tab__header">
            <h2><app-icon name="document"></app-icon> Genomic Report${name ? ` — ${name}` : ''}</h2>
          </div>
          <p class="report-tab__meta">
            No scored traits yet. Results will appear here as scoring completes.
          </p>
        </div>`;
      }
      const sorted = [...scored].sort(
        (a, b) => (results[b.trait_id]?.percentile || 0) - (results[a.trait_id]?.percentile || 0),
      );
      return html`
        <div class="report-tab">
          <div class="report-tab__header">
            <h2><app-icon name="document"></app-icon> Genomic Report${name ? ` — ${name}` : ''}</h2>
            <button
              class="btn btn-ghost btn-sm"
              onclick="${(_host) => {
                const prev = document.title;
                document.title = `Asili | Genomic Report${name ? ' — ' + name : ''}`;
                window.print();
                document.title = prev;
              }}"
            >
              <app-icon name="printer"></app-icon> Print
            </button>
          </div>
          ${summarySection(scored)}
          <section class="report-tab__overview">
            <div class="report-tab__overview-chart">
              <h3><app-icon name="radar" size="sm"></app-icon> Category Overview</h3>
              <radar-chart categories="${JSON.stringify(cats)}"></radar-chart>
              <p class="report-tab__meta">
                ${scored.length} traits across ${cats.length} categories
              </p>
            </div>
            <div class="report-tab__overview-breakdown">${categoryCards(cats)}</div>
          </section>
          ${sorted.length > 0
            ? traitSection('trending-up', 'Top Elevated', sorted.slice(0, 5))
            : html``}
          ${sorted.length > 0
            ? traitSection('trending-down', 'Below Average', [...sorted].reverse().slice(0, 5))
            : html``}
          ${qualitySection(scored)}
          <p class="report-tab__disclaimer">
            <app-icon name="alert" size="sm"></app-icon>
            This report is for informational purposes only and is not a medical diagnosis. Polygenic
            scores reflect statistical associations, not certainties. Consult a healthcare
            professional for medical advice.
          </p>
        </div>
      `;
    },
    shadow: false,
  },
});

/**
 *
 */
function traitSection(icon, title, traits) {
  return html`
    <section class="report-tab__section">
      <h3><app-icon name="${icon}" size="sm"></app-icon> ${title}</h3>
      ${traitTable(traits)}
    </section>
  `;
}
