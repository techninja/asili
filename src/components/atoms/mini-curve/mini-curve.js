/**
 * Mini bell curve — SVG showing percentile positions on a normal distribution.
 * Emojis sit in a row above the curve with angled connector lines to their
 * actual positions. Active individual is prioritized and larger.
 * @module components/atoms/mini-curve
 */

import { html, define } from 'hybrids';
import {
  VW,
  H,
  EMOJI_ROW,
  CB,
  CURVE,
  ACTIVE_SIZE,
  OTHER_SIZE,
  toX,
  toY,
  col,
  resolveRow,
} from './curve-layout.js';

/**
 *
 */
function buildSvg(pct, indEmoji, markers, dimmed) {
  const others = markers ? JSON.parse(markers) : [];
  const c = col(pct);
  const resolved = resolveRow(pct, others);
  const activeX = toX(pct);

  let s = `<svg viewBox="0 0 ${VW} ${H}" class="mini-curve">`;
  s += `<path d="${CURVE}" fill="var(--color-surface-alt)" stroke="var(--color-border)" stroke-width="0.5"/>`;

  for (const m of resolved) {
    const tx = m.trueX.toFixed(1);
    const dx = m.displayX.toFixed(1);
    const cy = toY(m.p).toFixed(1);
    const op = dimmed ? 0.1 : 0.4;
    const name = m.n || '';
    const pctLabel = `${Math.round(m.p)}th percentile`;
    s += `<g class="mini-curve__marker">`;
    s += `<title>${name} — ${pctLabel}</title>`;
    s += `<line x1="${dx}" y1="${EMOJI_ROW + 3}" x2="${tx}" y2="${cy}" stroke="#888" stroke-width="0.5" stroke-dasharray="2 1.5" opacity="${op}"/>`;
    s += `<circle cx="${tx}" cy="${cy}" r="1.5" fill="#888" opacity="${op}"/>`;
    s += `<text x="${dx}" y="${EMOJI_ROW}" text-anchor="middle" font-size="${OTHER_SIZE}" opacity="${op}">${m.e}</text>`;
    s += `</g>`;
  }

  const ax = activeX.toFixed(1);
  const ay = toY(pct).toFixed(1);
  s += `<line x1="${ax}" y1="${EMOJI_ROW + 2}" x2="${ax}" y2="${CB}" stroke="${c}" stroke-width="1.5" opacity="0.7"/>`;
  s += `<circle cx="${ax}" cy="${ay}" r="3.5" fill="${c}"/>`;
  s += `<text x="${ax}" y="${EMOJI_ROW}" text-anchor="middle" font-size="${ACTIVE_SIZE}">${indEmoji}</text>`;

  s += '</svg>';
  return s;
}

export default define({
  tag: 'mini-curve',
  value: 50,
  indEmoji: '👤',
  markers: '',
  dimmed: false,
  render: {
    value: ({ value, indEmoji, markers, dimmed }) => {
      const pct = Math.max(1, Math.min(99, value || 50));
      return html`<div
        class="mini-curve-wrap"
        innerHTML="${buildSvg(pct, indEmoji, markers, dimmed)}"
        onclick="${(host) => {
          host.dimmed = !host.dimmed;
        }}"
      ></div>`;
    },
    shadow: false,
  },
});
