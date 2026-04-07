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
  if (r <= 0) return '<1st %ile';
  if (r >= 100) return '>99th %ile';
  const s =
    r % 10 === 1 && r !== 11
      ? 'st'
      : r % 10 === 2 && r !== 12
        ? 'nd'
        : r % 10 === 3 && r !== 13
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
