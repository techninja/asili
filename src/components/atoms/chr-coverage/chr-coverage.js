/**
 * Chromosome coverage chart — outline bars with fill + donut pie.
 * Shows matched vs total variants per chromosome for the best PGS.
 * @module components/atoms/chr-coverage
 */

import { html, define } from 'hybrids';

const CHRS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
];
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
  tag: 'chr-coverage',
  data: '',
  render: {
    value: ({ data }) => {
      const svg = data ? buildSvg(JSON.parse(data)) : '';
      return html`<div class="chr-coverage" innerHTML="${svg}"></div>`;
    },
    shadow: false,
  },
});

/** @param {{matched: Record<string, number>, totals?: Record<string, number>}} d */
function buildSvg(d) {
  const matched = d.matched || d;
  const totals = d.totals || {};
  const hasTotals = Object.keys(totals).length > 0;
  const rows = CHRS.map((c) => ({
    chr: c,
    m: matched[c] || 0,
    t: totals[c] || matched[c] || 0,
    col: COLORS[c],
  }));
  const totalM = rows.reduce((s, r) => s + r.m, 0);
  const totalT = rows.reduce((s, r) => s + r.t, 0);
  const maxT = Math.max(...rows.map((r) => r.t), 1);
  const pct = totalT > 0 ? Math.round((totalM / totalT) * 100) : 0;

  const W = 320,
    barH = 80;
  const gap = W / CHRS.length;
  const bw = Math.max(4, gap - 3);

  let bars = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const x = Math.round(i * gap + (gap - bw) / 2);
    const th = Math.max(2, (r.t / maxT) * barH);
    const mh = r.t > 0 ? (r.m / r.t) * th : 0;
    const ty = barH - th,
      my = barH - mh;
    const tip =
      `Chr ${r.chr}: ${r.m.toLocaleString()}` +
      (hasTotals ? ` / ${r.t.toLocaleString()}` : '') +
      ' variants';
    // Outline bar (total)
    bars += `<rect x="${x}" y="${ty}" width="${bw}" height="${th}" fill="${r.col}" fill-opacity="0.12" stroke="${r.col}" stroke-opacity="0.3" stroke-width="1" rx="2"><title>${tip}</title></rect>`;
    // Filled bar (matched)
    if (mh > 0) {
      bars += `<rect x="${x}" y="${my}" width="${bw}" height="${mh}" fill="${r.col}" rx="2"><title>${tip}</title></rect>`;
    }
    bars += `<text x="${Math.round(i * gap + gap / 2)}" y="97" text-anchor="middle" font-size="9" fill="var(--color-text-muted)">${r.chr}</text>`;
  }

  // Donut pie in top-right
  const pr = 22,
    ps = 14;
  const px = W - pr - 4,
    py = pr - 10;
  const circ = 2 * Math.PI * pr;
  const covFrac = pct / 100;
  let pie = `<circle cx="${px}" cy="${py}" r="${pr}" fill="none" stroke="var(--color-border)" stroke-width="${ps}"/>`;
  let cum = 0;
  const active = rows.filter((r) => r.m > 0);
  for (const r of active) {
    const frac = r.m / totalM;
    const dash = frac * circ * covFrac;
    const off = circ / 4 - cum;
    cum += dash;
    pie += `<circle cx="${px}" cy="${py}" r="${pr}" fill="none" stroke="${r.col}" stroke-width="${ps}" stroke-linecap="butt" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${off}"/>`;
  }
  pie += `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--color-text)">${pct}%</text>`;

  const legend =
    `${totalM.toLocaleString()} variants matched` +
    (hasTotals ? ` of ~${totalT.toLocaleString()}` : '');
  return `<svg viewBox="0 0 ${W} 100" class="chr-coverage__svg">${bars}${pie}</svg><div class="chr-coverage__legend">${legend}</div>`;
}
