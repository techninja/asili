/**
 * Trait detail view — full result for one trait + one individual.
 * Shows percentile, PGS breakdown, variant spotlight, family comparison.
 * @module pages/trait-detail
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '../../components/atoms/percentile-bar/percentile-bar.js';
// @ts-ignore
import '../../components/atoms/confidence-badge/confidence-badge.js';
// @ts-ignore
import '../../components/molecules/pgs-table/pgs-table.js';
// @ts-ignore
import '../../components/molecules/family-compare/family-compare.js';
import { results } from '../beta/results-store.js';

export default define({
  tag: 'trait-detail-view',
  [router.connect]: { url: '/trait/:traitId' },
  traitId: '',
  render: {
    value: ({ traitId }) => {
      const r = results[traitId];
      if (!r) return noResult(traitId);

      const pgsEntries = r.pgsDetails ? buildPgsEntries(r) : [];

      return html`
        <div class="trait-detail">
          <a href="${router.backUrl()}" class="trait-detail__back">← Back</a>
          <h1 class="trait-detail__title">${traitId}</h1>

          <section class="trait-detail__section">
            <h2>Score</h2>
            <percentile-bar value="${r.percentile || 0}"></percentile-bar>
            <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
            ${r.value !== undefined && r.value !== null
              ? html`<p class="trait-detail__value">Predicted: ${Math.round(r.value * 10) / 10}</p>`
              : html``}
          </section>

          <section class="trait-detail__section">
            <h2>Best PGS</h2>
            <p>${r.bestPGS || '—'} · Quality: ${(r.bestPGSQualityScore || 0).toFixed(1)}</p>
            <p class="trait-detail__meta">
              ${r.totalMatches?.toLocaleString() || 0} variants matched
            </p>
          </section>

          ${pgsEntries.length > 0
            ? html`
                <section class="trait-detail__section">
                  <h2>PGS Comparison</h2>
                  <pgs-table pgsData="${JSON.stringify(pgsEntries)}"></pgs-table>
                </section>
              `
            : html``}

          <section class="trait-detail__section">
            <h2>Family Comparison</h2>
            <family-compare individuals="[]"></family-compare>
          </section>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {string} traitId */
function noResult(traitId) {
  return html`
    <div class="trait-detail">
      <a href="${router.backUrl()}" class="trait-detail__back">← Back</a>
      <h1 class="trait-detail__title">${traitId}</h1>
      <p class="trait-detail__empty">No scored result. Upload DNA and score this trait first.</p>
    </div>
  `;
}

/**
 * Build PGS entries for the comparison table from result data.
 * @param {object} r - Trait result
 * @returns {Array<object>}
 */
function buildPgsEntries(r) {
  return Object.entries(r.pgsDetails)
    .map(([id, d]) => ({
      id,
      r2: d.performanceMetric,
      zScore: d.zScore,
      coverage: d.coverage,
      qualityScore: d.qualityScore,
      isBest: id === r.bestPGS,
    }))
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
    .slice(0, 5);
}
