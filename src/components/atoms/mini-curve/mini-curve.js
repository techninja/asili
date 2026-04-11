/**
 * Mini bell curve — SVG showing percentile positions on a normal distribution.
 * Uses innerHTML to render SVG in proper namespace.
 * @module components/atoms/mini-curve
 */

import { html, define } from 'hybrids';

const W = 160;
const H = 80;
const EZ = 18;
const CB = H;
const CP = EZ + 4;
const CR = CB - CP;
const PM = 1 / Math.sqrt(2 * Math.PI);

/** @param {number} z */
function pdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

const CURVE = (() => {
  const pts = [];
  for (let x = 0; x <= W; x += 2) {
    const z = (x / W - 0.5) * 8;
    pts.push(`${x},${(CB - (pdf(z) / PM) * CR).toFixed(1)}`);
  }
  return `M0,${CB} L${pts.join(' L')} L${W},${CB} Z`;
})();

/**
 *
 */
function toX(pct) {
  return (Math.max(1, Math.min(99, pct)) / 100) * W;
}

/**
 *
 */
function toY(pct) {
  const z = (Math.max(1, Math.min(99, pct)) / 100 - 0.5) * 8;
  return CB - (pdf(z) / PM) * CR;
}

/**
 *
 */
function col(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct <= 30) return '#ef4444';
  return '#3b82f6';
}

/**
 *
 */
function mk(pct, em, c, dim) {
  const x = toX(pct).toFixed(1);
  const y = toY(pct).toFixed(1);
  const sw = dim ? 0.75 : 2;
  const da = dim ? ' stroke-dasharray="3 2"' : '';
  const op = dim ? 0.4 : 0.8;
  return (
    `<line x1="${x}" y1="${EZ}" x2="${x}" y2="${CB}" stroke="${c}" stroke-width="${sw}"${da} opacity="${op}"/>` +
    `<circle cx="${x}" cy="${y}" r="${dim ? 2 : 3}" fill="${c}"/>` +
    `<text x="${x}" y="14" text-anchor="middle" font-size="12">${em}</text>`
  );
}

/**
 *
 */
function buildSvg(pct, indEmoji, markers) {
  const others = markers ? JSON.parse(markers) : [];
  const c = col(pct);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="mini-curve">`;
  s += `<path d="${CURVE}" fill="var(--color-surface-alt)" stroke="var(--color-border)" stroke-width="0.5"/>`;
  for (const m of others) s += mk(m.p, m.e, '#888', true);
  s += mk(pct, indEmoji, c, false);
  s += '</svg>';
  return s;
}

export default define({
  tag: 'mini-curve',
  value: 50,
  indEmoji: '👤',
  markers: '',
  render: {
    value: ({ value, indEmoji, markers }) => {
      const pct = Math.max(1, Math.min(99, value || 50));
      return html`<div
        class="mini-curve-wrap"
        innerHTML="${buildSvg(pct, indEmoji, markers)}"
      ></div>`;
    },
    shadow: false,
  },
});
