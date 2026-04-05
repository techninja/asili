/**
 * Report view — printable report with category analysis.
 * Designed for print/PDF via browser's native Print dialog.
 * @module pages/report
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '../../components/organisms/radar-chart/radar-chart.js';
// @ts-ignore
import '../../components/atoms/confidence-badge/confidence-badge.js';
import { results } from '../beta/results-store.js';
import { buildCategorySummary } from '../../utils/categories.js';
import { getTraitList } from '../../utils/manifest.js';

export default define({
  tag: 'report-view',
  [router.connect]: { url: '/report' },
  traits: {
    value: /** @type {Array<object>} */ ([]),
    connect(host, _key, invalidate) {
      getTraitList().then((list) => {
        host.traits = list;
        invalidate();
      });
    },
  },
  render: {
    value: ({ traits }) => {
      const cats = buildCategorySummary(results, traits);
      const scored = traits.filter((t) => results[t.trait_id]);
      const top5 = scored
        .filter((t) => results[t.trait_id]?.percentile !== null)
        .sort(
          (a, b) => (results[b.trait_id]?.percentile || 0) - (results[a.trait_id]?.percentile || 0),
        );
      const elevated = top5.slice(0, 5);
      const low = [...top5].reverse().slice(0, 5);

      return html`
        <div class="report">
          <header class="report__header">
            <a href="${router.backUrl()}" class="report__back no-print">← Back</a>
            <h1>Asili Genomic Report</h1>
            <p class="report__date">Generated ${new Date().toLocaleDateString()}</p>
            <p class="report__disclaimer">
              This is not a medical diagnosis. Consult a healthcare professional.
            </p>
          </header>

          <section class="report__section">
            <h2>Category Overview</h2>
            <radar-chart categories="${JSON.stringify(cats)}"></radar-chart>
            <p class="report__meta">${scored.length} traits scored</p>
          </section>

          ${elevated.length > 0
            ? html`
                <section class="report__section">
                  <h2>Top Elevated Traits</h2>
                  ${traitTable(elevated)}
                </section>
              `
            : html``}
          ${low.length > 0
            ? html`
                <section class="report__section">
                  <h2>Below Average Traits</h2>
                  ${traitTable(low)}
                </section>
              `
            : html``}

          <section class="report__section">
            <h2>Data Quality</h2>
            <p>Report generated locally. Your data never left this device.</p>
          </section>

          <button class="btn btn-primary no-print" onclick="${() => window.print()}">
            Print / Save as PDF
          </button>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {Array<object>} traits */
function traitTable(traits) {
  return html`
    <table class="report__table">
      <thead>
        <tr>
          <th>Trait</th>
          <th>Percentile</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${traits.map((t) => {
          const r = results[t.trait_id];
          return html`<tr>
            <td>${t.emoji || '🧬'} ${t.name}</td>
            <td>${Math.round(r?.percentile || 0)}th</td>
            <td><confidence-badge level="${r?.confidence || 'none'}"></confidence-badge></td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}
