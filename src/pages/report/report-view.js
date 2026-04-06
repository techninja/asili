/**
 * Report view — printable report with category analysis.
 * Designed for print/PDF via browser's native Print dialog.
 * @module pages/report
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#organisms/radar-chart/radar-chart.js';
// @ts-ignore
import '#atoms/confidence-badge/confidence-badge.js';
import { results, getActiveId } from '#pages/beta/results-store.js';
import { buildCategorySummary } from '#utils/categories.js';
import { getTraitList } from '#utils/manifest.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import * as idb from '/packages/core/src/data-layer/idb.js';

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
  individual: {
    value: /** @type {object|null} */ (null),
    connect(host, _key, invalidate) {
      loadIndividual(host).then(invalidate);
    },
  },
  render: {
    value: ({ traits, individual }) => {
      const cats = buildCategorySummary(results, traits);
      const scored = traits.filter((t) => results[t.trait_id]);
      const sorted = scored
        .filter(
          (t) =>
            results[t.trait_id]?.percentile !== null &&
            results[t.trait_id]?.percentile !== undefined,
        )
        .sort(
          (a, b) => (results[b.trait_id]?.percentile || 0) - (results[a.trait_id]?.percentile || 0),
        );
      const elevated = sorted.slice(0, 5);
      const low = [...sorted].reverse().slice(0, 5);
      const name = individual ? `${individual.emoji} ${individual.name}` : 'Asili';

      return html`
        <div class="report">
          <header class="report__header">
            <a href="${router.backUrl()}" class="report__back no-print">← Back</a>
            <h1>${name} — Genomic Report</h1>
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
            <p class="report__meta">
              ${individual?.variantCount?.toLocaleString() || '—'} variants loaded
            </p>
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
          <th>Value</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${traits.map((t) => {
          const r = results[t.trait_id];
          const fmt =
            r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
          return html`<tr>
            <td>${t.emoji || '🧬'} ${t.name}</td>
            <td>${Math.round(r?.percentile || 0)}th</td>
            <td>${fmt?.display || '—'}</td>
            <td><confidence-badge level="${r?.confidence || 'none'}"></confidence-badge></td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}

/** @param {object} host */
async function loadIndividual(host) {
  try {
    const id = getActiveId();
    if (!id) return;
    await idb.openDB();
    host.individual = await idb.get('individuals', id);
  } catch {
    /* no individual */
  }
}
