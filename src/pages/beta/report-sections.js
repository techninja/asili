/**
 * Report section renderers — stats, categories, quality.
 * @module pages/beta/report-sections
 */

import { html } from 'hybrids';
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
  return html`
    <section class="report-tab__section">
      <h3><app-icon name="shield-check" size="sm"></app-icon> Data Quality</h3>
      <div class="report-tab__quality-bars">
        ${qBar('High coverage (≥80%)', s.highCov, scored.length, 'var(--color-success)')}
        ${qBar('Medium (50–80%)', s.midCov, scored.length, 'var(--color-info)')}
        ${qBar('Low (<50%)', s.lowCov, scored.length, 'var(--color-warning)')}
      </div>
    </section>
  `;
}

/**
 *
 */
function qBar(label, count, total, color) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return html`
    <div class="report-tab__qbar-row">
      <span class="report-tab__qbar-label">${label}</span>
      <div class="report-tab__qbar-track">
        <div class="report-tab__qbar-fill" style="${{ width: `${pct}%`, background: color }}"></div>
      </div>
      <span class="report-tab__qbar-val">${count}</span>
    </div>
  `;
}
