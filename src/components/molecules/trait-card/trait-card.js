/**
 * Trait card molecule — shows one trait's score summary.
 * Handles null/insufficient results with imputation messaging.
 * @module components/molecules/trait-card
 */

import { html, define } from 'hybrids';
// @ts-ignore — side-effect import for web component registration
import '#atoms/percentile-bar/percentile-bar.js';
// @ts-ignore — side-effect import for web component registration
import '#atoms/confidence-badge/confidence-badge.js';

const NULL_CONF = ['none', 'insufficient', ''];

export default define({
  tag: 'trait-card',
  emoji: '🧬',
  name: '',
  traitType: 'disease_risk',
  percentile: 0,
  confidence: '',
  value: '',
  unit: '',
  scored: false,
  scoring: false,
  hasIndividual: false,
  render: {
    value: ({
      emoji,
      name,
      traitType,
      percentile,
      confidence,
      value,
      unit,
      scored,
      scoring,
      hasIndividual,
    }) => {
      const hasResult = scored && !NULL_CONF.includes(confidence);
      return html`
        <div class="trait-card ${hasResult ? '' : 'trait-card--empty'}">
          <div class="trait-card__header">
            <span class="trait-card__emoji">${emoji}</span>
            <span class="trait-card__name">${name}</span>
          </div>
          ${hasResult
            ? scoredBody(percentile, confidence, traitType, value, unit)
            : emptyBody(scored, scoring, hasIndividual, confidence)}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {number} pct @param {string} conf @param {string} type @param {string} val @param {string} u */
function scoredBody(pct, conf, type, val, u) {
  return html`
    <percentile-bar value="${pct}"></percentile-bar>
    ${val && type === 'quantitative' ? html`<p class="trait-card__value">${val} ${u}</p>` : html``}
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
