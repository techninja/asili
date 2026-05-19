/**
 * Chromosome contribution — diverging bar chart of per-chr score contribution.
 * Positive bars go up (risk), negative bars go down (protective).
 * @module components/atoms/chr-contribution/chr-contribution
 */

import { define, html } from 'hybrids';

const CHRS = Array.from({ length: 22 }, (_, i) => String(i + 1));
const COLORS = {
  1: '#ef4444',
  2: '#f97316',
  3: '#f59e0b',
  4: '#eab308',
  5: '#84cc16',
  6: '#22c55e',
  7: '#10b981',
  8: '#14b8a6',
  9: '#06b6d4',
  10: '#0ea5e9',
  11: '#3b82f6',
  12: '#6366f1',
  13: '#8b5cf6',
  14: '#a855f7',
  15: '#c084fc',
  16: '#d946ef',
  17: '#ec4899',
  18: '#f43f5e',
  19: '#fb7185',
  20: '#fda4af',
  21: '#93c5fd',
  22: '#86efac',
};

export default define({
  tag: 'chr-contribution',
  data: '',
  render: {
    value: ({ data }) => {
      const svg = data ? buildSvg(JSON.parse(data)) : '';
      return html`<div class="chr-contrib" innerHTML="${svg}"></div>`;
    },
    shadow: false,
  },
});

const W = 320,
  H = 100;

/** @param {{contribution: Record<string, number>, imputed: Record<string, number>}} d */
function buildSvg(d) {
  const contrib = d.contribution || {};
  const imputed = d.imputed || {};
  const rows = CHRS.map((c) => ({ chr: c, v: contrib[c] || 0, imp: imputed[c] || 0 }));
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.v)), 0.001);
  const mid = H / 2,
    scale = (mid - 8) / maxAbs;
  const gap = W / CHRS.length,
    bw = Math.max(4, gap - 3);

  let bars = '',
    labels = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const x = Math.round(i * gap + (gap - bw) / 2);
    const h = Math.abs(r.v) * scale;
    const y = r.v >= 0 ? mid - h : mid;
    const col = COLORS[r.chr];
    const imp = r.imp > 0 ? ` (${r.imp} imputed)` : '';
    const tip = `Chr ${r.chr}: ${r.v >= 0 ? '+' : ''}${r.v.toFixed(4)}${imp}`;
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 0.5)}" fill="${col}" rx="1.5"><title>${tip}</title></rect>`;
    labels += `<text x="${Math.round(i * gap + gap / 2)}" y="${H - 1}" text-anchor="middle" font-size="8" fill="var(--color-text-muted)">${r.chr}</text>`;
  }

  const zero = `<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--color-border)" stroke-width="0.5"/>`;
  const total = rows.reduce((s, r) => s + r.v, 0);
  const sign = total >= 0 ? '+' : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chr-contrib__svg">${zero}${bars}${labels}</svg><div class="chr-contrib__total">Net: ${sign}${total.toFixed(4)}</div>`;
}
