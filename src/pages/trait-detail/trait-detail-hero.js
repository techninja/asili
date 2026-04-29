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
  const fmt = r.value !== null && r.value !== undefined ? formatTraitValue(r.value, t?.unit) : null;
  const markers = (Array.isArray(fd) ? fd : []).map((f) => ({ e: f.emoji || '👤', p: Math.round(f.percentile || 0) }));
  const interp = interpretLine(r, t);
  return html`
    <section class="trait-detail__score-hero">
      <mini-curve
        value="${r.percentile || 50}"
        indEmoji="${indEmoji || '🧬'}"
        markers="${markers.length ? JSON.stringify(markers) : ''}"
      ></mini-curve>
      <div class="trait-detail__score-stats">
        <span class="trait-detail__percentile">${fmtPct(r.percentile || 0)}</span>
        <span class="trait-detail__pct-label">percentile</span>
        ${fmt ? html`<span class="trait-detail__pred">${fmt.display}</span>` : html``}
        <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
      </div>
      ${interp}
    </section>
  `;
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
