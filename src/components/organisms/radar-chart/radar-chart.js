/**
 * Radar chart organism — category-level percentile visualization.
 * Renders as CSS bars initially; Chart.js radar overlay added post-launch.
 * @module components/organisms/radar-chart
 */

import { html, define } from 'hybrids';

export default define({
  tag: 'radar-chart',
  categories: '',
  render: {
    value: ({ categories }) => {
      const cats = categories ? JSON.parse(categories) : [];
      if (cats.length === 0) {
        return html`<p class="radar-chart__empty">Score traits to see category analysis</p>`;
      }
      return html`
        <div class="radar-chart">
          ${cats.map(
            (c) => html`
              <div class="radar-chart__row">
                <span class="radar-chart__label">${c.category}</span>
                <div class="radar-chart__bar-track">
                  <div
                    class="radar-chart__bar-fill"
                    style="${{ width: `${c.avgPercentile}%` }}"
                  ></div>
                  <div class="radar-chart__bar-mid"></div>
                </div>
                <span class="radar-chart__value">${c.avgPercentile}%</span>
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});
