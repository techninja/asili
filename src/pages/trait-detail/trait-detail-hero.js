/**
 * Trait detail score hero — large bell curve with family markers.
 * @module pages/trait-detail/trait-detail-hero
 */

import { html } from 'hybrids';
import { formatTraitValue } from '/packages/core/src/formatter.js';
// @ts-ignore
import '#atoms/mini-curve/mini-curve.js';
// @ts-ignore
import '#atoms/confidence-badge/confidence-badge.js';

/** Score hero — large bell curve with family markers for the top-right. */
export function scoreHero(r, t, fd, indEmoji) {
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  const predictedValue = computeDisplayValue(r, t, det);
  const fmt = predictedValue !== null ? formatTraitValue(predictedValue, t?.unit) : null;
  const markers = (Array.isArray(fd) ? fd : []).map((f) => ({ e: f.emoji || '👤', p: Math.round(f.percentile || 0), n: f.name || '' }));
  const interp = interpretLine(r, t);
  const r2 = det?.performanceMetric;
  const cov = det?.coverage || 0;
  const tooltip = confidenceTooltip(r.confidence, r2, cov);
  return html`
    <section class="trait-detail__score-hero">
      <div class="trait-detail__score-hero-badge" title="${tooltip}">
        <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
      </div>
      <mini-curve
        value="${r.percentile || 50}"
        indEmoji="${indEmoji || '🧬'}"
        markers="${markers.length ? JSON.stringify(markers) : ''}"
      ></mini-curve>
      <div class="trait-detail__score-stats">
        <span class="trait-detail__percentile">${fmtPct(r.percentile || 0)}</span>
        <span class="trait-detail__pct-label">percentile</span>
      </div>
      ${fmt && t?.value_display !== 'percentile_only' ? html`<span class="trait-detail__pred">${fmt.display}</span>` : html``}
      ${interp}
      ${r2 ? predictiveNote(r2) : html``}
    </section>
  `;
}

/** Compute predicted value from stored result or retroactively from z-score. */
function computeDisplayValue(r, t, det) {
  if (r.value !== null && r.value !== undefined) return r.value;
  if (!det?.zScore || !t?.phenotype_mean || !t?.phenotype_sd) return null;
  const r2 = det.performanceMetric || 0.05;
  return t.phenotype_mean + det.zScore * Math.sqrt(r2) * t.phenotype_sd;
}

/** Plain-english note about what R² means for this score. */
function predictiveNote(r2) {
  const pct = Math.round(r2 * 100);
  if (pct < 1) return html``;
  const strength = pct >= 20 ? 'strong' : pct >= 5 ? 'moderate' : 'modest';
  return html`<p class="trait-detail__r2-note">
    ~${pct}% of variation explained — ${strength} predictor
  </p>`;
}

/** Build tooltip explaining confidence reasoning. */
function confidenceTooltip(level, r2, coverage) {
  const parts = [];
  if (r2) parts.push(`R²: ${(r2 * 100).toFixed(1)}% predictive accuracy`);
  if (coverage) parts.push(`Coverage: ${Math.round(coverage * 100)}% of variants matched`);
  if (level === 'high') parts.push('Strong data quality across all metrics');
  else if (level === 'medium') parts.push('Moderate data — some variants missing or lower study power');
  else if (level === 'low') parts.push('Limited data — interpret with caution');
  return parts.join('\n');
}

/** @param {number} p */
function fmtPct(p) {
  const r = Math.round(p);
  if (r <= 0) return '<1st';
  if (r >= 100) return '>99th';
  const s =
    r % 10 === 1 && r !== 11
      ? 'st'
      : r % 10 === 2 && r !== 12
        ? 'nd'
        : r % 10 === 3 && r !== 13
          ? 'rd'
          : 'th';
  return `${r}${s}`;
}

/** Build interpretation line from score_interpretation + z-score. */
function interpretLine(r, t) {
  const si = t?.score_interpretation;
  if (!si) return html``;
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  const z = det?.zScore ?? 0;
  const positive = z >= 0;
  const text = positive ? si.higher : si.lower;
  if (!text) return html``;
  const dir = si.direction || 'neutral';
  let cls = 'trait-detail__interp--neutral';
  if (dir === 'higher_better') cls = positive ? 'trait-detail__interp--good' : 'trait-detail__interp--caution';
  else if (dir === 'lower_better') cls = positive ? 'trait-detail__interp--caution' : 'trait-detail__interp--good';
  return html`<p class="trait-detail__interp ${cls}">Your score suggests ${text}</p>`;
}
