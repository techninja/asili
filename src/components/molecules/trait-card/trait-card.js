/**
 * Trait card molecule — shows one trait's score summary.
 * Empty state when no result exists yet.
 * @module components/molecules/trait-card
 */

import { html, define } from 'hybrids';
// @ts-ignore — side-effect import for web component registration
import '#atoms/percentile-bar/percentile-bar.js';
// @ts-ignore — side-effect import for web component registration
import '#atoms/confidence-badge/confidence-badge.js';

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
  render: {
    value: ({ emoji, name, traitType, percentile, confidence, value, unit, scored }) => html`
      <div class="trait-card ${scored ? '' : 'trait-card--empty'}">
        <div class="trait-card__header">
          <span class="trait-card__emoji">${emoji}</span>
          <span class="trait-card__name">${name}</span>
        </div>
        ${scored ? scoredBody(percentile, confidence, traitType, value, unit) : emptyBody()}
      </div>
    `,
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

/** Empty state */
function emptyBody() {
  return html` <p class="trait-card__empty">Upload DNA to see your score</p> `;
}
