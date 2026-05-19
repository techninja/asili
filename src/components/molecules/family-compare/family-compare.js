/**
 * Family comparison molecule — side-by-side percentile bars.
 * @module components/molecules/family-compare
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#atoms/percentile-bar/percentile-bar.js';

export default define({
  tag: 'family-compare',
  individuals: '',
  render: {
    value: ({ individuals }) => {
      let list = [];
      try {
        const raw = Array.isArray(individuals)
          ? individuals
          : individuals
            ? JSON.parse(individuals)
            : [];
        if (Array.isArray(raw)) list = raw;
      } catch {
        /* bad JSON */
      }
      if (list.length === 0) {
        return html`<p class="family-compare__empty">No family data</p>`;
      }
      return html`
        <div class="family-compare">
          ${list.map(
            (ind) => html`
              <div class="family-compare__row">
                <span class="family-compare__name">${ind.emoji || '👤'} ${ind.name}</span>
                <percentile-bar value="${ind.percentile || 0}"></percentile-bar>
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});
