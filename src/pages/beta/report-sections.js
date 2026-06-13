/**
 * Report section renderers — stats, categories, quality.
 * @module pages/beta/report-sections
 */

import { html } from 'hybrids';
import { results } from './results-store.js';
import { computeStats, traitTable } from './report-helpers.js';
// @ts-ignore
import '#atoms/mini-curve/mini-curve.js';

export { traitTable };

/**
 *
 */
export function summarySection(scored) {
  const s = computeStats(scored);
  return html`
    <div class="report-tab__stats">
      ${stat('Traits Scored', s.count, 'flask-conical')}
      ${stat('Avg Coverage', s.avgCov + '%', 'dna')} ${stat('Avg Quality', s.avgAqs, 'sparkles')}
      ${stat('Data Source', s.source, s.source === 'Imputed' ? 'zap' : 'upload')}
    </div>
  `;
}

/**
 *
 */
function stat(label, value, icon) {
  return html`
    <div class="report-tab__stat">
      <app-icon name="${icon}" size="sm"></app-icon>
      <span class="report-tab__stat-val">${value}</span>
      <span class="report-tab__stat-label">${label}</span>
    </div>
  `;
}

/**
 *
 */
export function categoryCards(cats) {
  if (!cats.length) return html``;
  return html`
    <section class="report-tab__section">
      <h3><app-icon name="layers" size="sm"></app-icon> Category Breakdown</h3>
      <div class="report-tab__cat-grid">
        ${cats.map(
          (c) => html`
            <div class="report-tab__cat-card">
              <mini-curve value="${c.avgPercentile}" indEmoji="" markers=""></mini-curve>
              <div class="report-tab__cat-card-head">
                <span class="report-tab__cat-name">${c.category}</span>
                <span
                  class="report-tab__cat-badge"
                  style="${{ background: pctColor(c.avgPercentile) }}"
                  >${c.avgPercentile}th</span
                >
              </div>
              <div class="report-tab__cat-bar">
                <div
                  class="report-tab__cat-bar-fill"
                  style="${{ width: `${c.avgPercentile}%`, background: pctColor(c.avgPercentile) }}"
                ></div>
              </div>
              <span class="report-tab__cat-detail">
                ${c.count} traits · ${c.elevated} elevated · ${c.low} low
              </span>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

/** Map percentile to a color: blue (low) → green (mid) → orange (high). */
function pctColor(pct) {
  if (pct < 30) return '#3b82f6';
  if (pct < 60) return '#22c55e';
  return '#f59e0b';
}

/**
 *
 */
export function qualitySection(scored) {
  const s = computeStats(scored);

  // Build coverage histogram (10% bins: 0-9%, 10-19%, ... 90-100%)
  const bins = Array(10).fill(0);
  for (const t of scored) {
    const r = results[t.trait_id];
    const det = r?.bestPGS && r.pgsDetails?.[r.bestPGS];
    const cov = (det?.coverage || 0) * 100;
    const idx = Math.min(Math.floor(cov / 10), 9);
    bins[idx]++;
  }
  const maxBin = Math.max(...bins, 1);

  return html`
    <section class="report-tab__section">
      <h3><app-icon name="shield-check" size="sm"></app-icon> Data Quality</h3>
      <p class="report-tab__quality-summary">${s.source} · ${s.avgCov}% avg variant coverage</p>
      ${s.source === 'Raw DNA'
        ? html`<p class="report-tab__quality-hint">
            Improve coverage and signal strength by upgrading to an
            <a href="https://impute.asili.dev" target="_blank" rel="noopener">imputed genome</a>.
          </p>`
        : html``}
      <div class="report-tab__histogram">
        ${bins.map(
          (count, i) => html`
            <div class="report-tab__histogram-col">
              <div
                class="report-tab__histogram-bar"
                style="${{ height: `${(count / maxBin) * 100}%` }}"
                title="${count} trait${count !== 1 ? 's' : ''} at ${i * 10}-${i * 10 + 9}% coverage"
              ></div>
              <span class="report-tab__histogram-label">${i * 10}</span>
            </div>
          `,
        )}
      </div>
      <p class="report-tab__histogram-axis">PGS Variant Coverage (%)</p>
    </section>
  `;
}
