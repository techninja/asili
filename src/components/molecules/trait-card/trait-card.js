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

/** @param {number} cov Coverage 0-100 @returns {string} CSS class */
function qualityTier(cov) {
  if (cov >= 80) return 'trait-card--tier-high';
  if (cov >= 50) return 'trait-card--tier-mid';
  if (cov >= 20) return 'trait-card--tier-low';
  return 'trait-card--tier-min';
}

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
  coverage: 0,
  category: '',
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
      coverage,
      category,
    }) => {
      const hasResult = scored && !NULL_CONF.includes(confidence);
      const tier = hasResult ? qualityTier(coverage) : '';
      return html`
        <div class="trait-card ${hasResult ? 'trait-card--scored' : 'trait-card--empty'} ${tier}">
          <div class="trait-card__header">
            <span class="trait-card__emoji">${emoji}</span>
            <span class="trait-card__name">${name}</span>
          </div>
          ${hasResult
            ? scoredBody(percentile, confidence, value, unit, markers, indEmoji)
            : emptyBody(scored, scoring, hasIndividual, confidence)}
          <div class="trait-card__footer">
            ${category ? html`<span class="trait-card__category">${category}</span>` : html``}
            ${hasResult && coverage > 0 && coverage < 50
              ? html`<span class="trait-card__coverage">${Math.round(coverage)}%</span>`
              : html``}
          </div>
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
      ${val ? html`<span class="trait-card__value">${val}</span>` : html``}
    </div>
    ${conf && conf !== 'high'
      ? html`<confidence-badge level="${conf}"></confidence-badge>`
      : html``}
  `;
}

/** @param {boolean} scored @param {boolean} scoring @param {boolean} hasInd @param {string} conf */
function emptyBody(scored, scoring, hasInd, conf) {
  const msg = scoring
    ? 'Scoring…'
    : scored && NULL_CONF.includes(conf)
      ? 'No variant matches'
      : hasInd
        ? 'Not yet scored'
        : 'Upload DNA';
  return html`
    <div class="trait-card__placeholder">
      <mini-curve value="50" indEmoji="" markers=""></mini-curve>
      <div class="trait-card__score">
        <span class="trait-card__percentile trait-card__percentile--empty">—</span>
        <span class="trait-card__pct-label">percentile</span>
      </div>
    </div>
    <p class="trait-card__empty">${msg}</p>
  `;
}
