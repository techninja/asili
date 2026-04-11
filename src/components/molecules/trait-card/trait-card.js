/**
 * Trait card molecule — shows one trait's score with mini bell curve.
 * @module components/molecules/trait-card
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#atoms/mini-curve/mini-curve.js';
// @ts-ignore
import '#atoms/confidence-badge/confidence-badge.js';

const NULL_CONF = ['none', 'insufficient', ''];

/** @param {number} p @returns {string} */
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

export default define({
  tag: 'trait-card',
  emoji: '🧬',
  name: '',
  traitType: 'quantitative',
  percentile: 0,
  confidence: '',
  value: '',
  unit: '',
  scored: false,
  scoring: false,
  hasIndividual: false,
  indEmoji: '👤',
  markers: '',
  render: {
    value: ({
      emoji,
      name,
      percentile,
      confidence,
      value,
      unit,
      scored,
      scoring,
      hasIndividual,
      indEmoji,
      markers,
    }) => {
      const hasResult = scored && !NULL_CONF.includes(confidence);
      return html`
        <div class="trait-card ${hasResult ? 'trait-card--scored' : 'trait-card--empty'}">
          <div class="trait-card__header">
            <span class="trait-card__emoji">${emoji}</span>
            <span class="trait-card__name">${name}</span>
          </div>
          ${hasResult
            ? scoredBody(percentile, confidence, value, unit, markers, indEmoji)
            : emptyBody(scored, scoring, hasIndividual, confidence)}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {number} pct @param {string} conf @param {string} val @param {string} u @param {string} m @param {string} ie */
function scoredBody(pct, conf, val, u, m, ie) {
  return html`
    <mini-curve value="${pct}" indEmoji="${ie}" markers="${m}"></mini-curve>
    <div class="trait-card__score">
      <span class="trait-card__percentile">${fmtPct(pct)}</span>
      <span class="trait-card__pct-label">percentile</span>
      ${val ? html`<span class="trait-card__value">${val} ${u}</span>` : html``}
    </div>
    <confidence-badge level="${conf}"></confidence-badge>
  `;
}

/** @param {boolean} scored @param {boolean} scoring @param {boolean} hasInd @param {string} conf */
function emptyBody(scored, scoring, hasInd, conf) {
  if (scoring) return html`<p class="trait-card__empty">Scoring…</p>`;
  if (scored && NULL_CONF.includes(conf))
    return html`<p class="trait-card__empty trait-card__empty--nodata">
      No variant matches<br /><span class="trait-card__hint">Imputation recommended</span>
    </p>`;
  if (hasInd) return html`<p class="trait-card__empty">Not yet scored</p>`;
  return html`<p class="trait-card__empty">Upload DNA to see your score</p>`;
}
