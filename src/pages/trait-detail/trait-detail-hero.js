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
export function scoreHero(r, t, fd) {
  const fmt = r.value !== null && r.value !== undefined ? formatTraitValue(r.value, t?.unit) : null;
  const markers = (fd || []).map((f) => ({ e: f.emoji || '👤', p: Math.round(f.percentile || 0) }));
  return html`
    <section class="trait-detail__score-hero">
      <mini-curve
        value="${r.percentile || 50}"
        indEmoji="🧬"
        markers="${markers.length ? JSON.stringify(markers) : ''}"
      ></mini-curve>
      <div class="trait-detail__score-stats">
        <span class="trait-detail__percentile">${fmtPct(r.percentile || 0)}</span>
        <span class="trait-detail__pct-label">percentile</span>
        ${fmt ? html`<span class="trait-detail__pred">${fmt.display}</span>` : html``}
        <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
      </div>
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
