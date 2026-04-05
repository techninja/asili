/**
 * Percentile bar atom — horizontal bar showing percentile position.
 * @module components/atoms/percentile-bar
 */

import { html, define } from 'hybrids';

/** @param {number} p @returns {string} */
function barColor(p) {
  if (p >= 80) return 'var(--color-success)';
  if (p >= 60) return 'var(--color-accent)';
  if (p >= 40) return 'var(--color-info)';
  if (p >= 20) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

/** @param {number} p @returns {string} */
function formatLabel(p) {
  if (p === null || p === undefined) return '—';
  const r = Math.round(p);
  const s =
    r === 1 || r === 21 || r === 31
      ? 'st'
      : r === 2 || r === 22 || r === 32
        ? 'nd'
        : r === 3 || r === 23 || r === 33
          ? 'rd'
          : 'th';
  return `${r}${s} %ile`;
}

export default define({
  tag: 'percentile-bar',
  value: 0,
  render: {
    value: ({ value }) => {
      const pct = Math.max(0, Math.min(100, value || 0));
      return html`
        <div class="percentile-bar">
          <div class="percentile-bar__track">
            <div
              class="percentile-bar__fill"
              style="${{ width: `${pct}%`, backgroundColor: barColor(pct) }}"
            ></div>
          </div>
          <span class="percentile-bar__label">${formatLabel(value)}</span>
        </div>
      `;
    },
    shadow: false,
  },
});
