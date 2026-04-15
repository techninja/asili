/**
 * Speedometer gauge — SVG arc with color-coded ranges and needle.
 * Low scores fade from red to dark (background noise territory).
 * @module components/atoms/speedometer
 */

import { html, define } from 'hybrids';

const DEFAULTS =
  '[[0,"#3b3b3b"],[15,"#7f1d1d"],[25,"#ef4444"],[40,"#f59e0b"],[55,"#eab308"],[70,"#22c55e"],[85,"#10b981"]]';

export default define({
  tag: 'speed-meter',
  value: 0,
  min: 0,
  max: 100,
  label: '',
  ranges: DEFAULTS,
  render: {
    value: ({ value, min, max, label, ranges }) => {
      const svg = buildGauge(value, min, max, label, JSON.parse(ranges));
      return html`<div class="speedometer" innerHTML="${svg}"></div>`;
    },
    shadow: false,
  },
});

/** @param {number} val @param {number} min @param {number} max @param {string} label @param {Array} ranges */
function buildGauge(val, min, max, label, ranges) {
  const W = 140,
    H = 82,
    cx = 70,
    cy = 72;
  const r = 56,
    sw = 18;
  const total = max - min || 1;
  const clamp = Math.max(min, Math.min(max, val));
  const frac = (clamp - min) / total;

  let arcs = '';
  for (let i = 0; i < ranges.length; i++) {
    const from = (ranges[i][0] - min) / total;
    const to = i < ranges.length - 1 ? (ranges[i + 1][0] - min) / total : 1;
    const a1 = Math.PI - from * Math.PI;
    const a2 = Math.PI - to * Math.PI;
    const x1 = cx + r * Math.cos(a1),
      y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2),
      y2 = cy - r * Math.sin(a2);
    const large = a1 - a2 > Math.PI ? 1 : 0;
    arcs += `<path d="M${f(x1)},${f(y1)} A${r},${r} 0 ${large} 1 ${f(x2)},${f(y2)}" fill="none" stroke="${ranges[i][1]}" stroke-width="${sw}" stroke-linecap="butt"/>`;
  }

  // Needle
  const na = Math.PI - frac * Math.PI;
  const nx = cx + (r - 4) * Math.cos(na);
  const ny = cy - (r - 4) * Math.sin(na);
  const needle = `<line x1="${cx}" y1="${cy}" x2="${f(nx)}" y2="${f(ny)}" stroke="var(--color-text)" stroke-width="2.5" stroke-linecap="round"/>`;
  const dot = `<circle cx="${cx}" cy="${cy}" r="4" fill="var(--color-text)"/>`;

  // Value — large, above center, with stroke outline for visibility
  const vt = `<text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--color-text)" stroke="var(--color-bg)" stroke-width="3" paint-order="stroke">${Math.round(val)}</text>`;
  const lt = label
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)">${label}</text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="speedometer__svg">${arcs}${needle}${dot}${vt}${lt}</svg>`;
}

/** @param {number} n */
const f = (n) => Math.round(n * 10) / 10;
