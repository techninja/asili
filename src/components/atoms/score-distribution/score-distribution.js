/**
 * Score distribution — SVG histogram with ancestry gaussian overlays.
 * Shows global population histogram + per-ancestry curves + individual marker.
 * @module components/atoms/score-distribution/score-distribution
 */

import { define, html } from 'hybrids';
import { getPgsDistribution } from '#utils/pgs-distribution.js';

/** @type {Map<string, object>} */
const cache = new Map();

/**
 *
 */
async function loadDist(host) {
  if (!host.pgsId) return;
  if (cache.has(host.pgsId)) {
    host.dist = cache.get(host.pgsId);
    return;
  }
  const d = await getPgsDistribution(host.pgsId);
  if (d) {
    cache.set(host.pgsId, d);
    host.dist = d;
  }
}

export default define({
  tag: 'score-distribution',
  pgsId: { value: '', observe: (host) => loadDist(host) },
  rawScore: 0,
  indEmoji: '🧬',
  dist: null,
  render: ({ dist, rawScore, indEmoji }) => {
    if (!dist?.bins?.length) return html`<div class="score-dist--empty"></div>`;
    return html`<div class="score-dist" innerHTML="${buildSvg(dist, rawScore, indEmoji)}"></div>`;
  },
});

const W = 300,
  H = 140,
  PAD_B = 4,
  PAD_T = 4;
const COLORS = [
  '#818cf8',
  '#34d399',
  '#f59e0b',
  '#ef4444',
  '#38bdf8',
  '#a78bfa',
  '#fb923c',
  '#f472b6',
];

/**
 *
 */
function buildSvg(dist, score, emoji) {
  const { bins, ancestry } = dist;
  const maxD = Math.max(...bins.map((b) => b.density));
  if (!maxD) return '';
  const n = bins.length,
    bw = W / n,
    chart = H - PAD_T - PAD_B;
  const lo = bins[0].min,
    hi = bins[n - 1].max,
    range = hi - lo || 1;

  let bars = '';
  for (let i = 0; i < n; i++) {
    const h = (bins[i].density / maxD) * chart;
    bars += `<rect x="${i * bw}" y="${H - PAD_B - h}" width="${bw - 0.5}" height="${h}" rx="1"/>`;
  }

  let curves = '',
    legend = '';
  if (ancestry?.length) {
    ancestry.forEach((pop, pi) => {
      const col = COLORS[pi % COLORS.length];
      const cls = `pop-${pop.pop}`;
      const pts = [];
      for (let x = 0; x <= W; x += 2) {
        const v = lo + (x / W) * range;
        const z = (v - pop.mean) / (pop.sd || 1);
        const y = H - PAD_B - Math.exp(-0.5 * z * z) * chart * 0.85;
        pts.push(`${x},${y.toFixed(1)}`);
      }
      curves += `<polyline class="score-dist__curve ${cls}" points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.6"/>`;
      const tx = 4 + (pi % 4) * 75,
        ty = 10 + Math.floor(pi / 4) * 11;
      legend += `<g class="score-dist__leg ${cls}"><circle cx="${tx}" cy="${ty - 3}" r="3" fill="${col}"/>`;
      legend += `<text x="${tx + 6}" y="${ty}" class="score-dist__legend">${pop.label}</text></g>`;
    });
  }

  const mx = Math.max(0, Math.min(W, ((score - lo) / range) * W));
  const emojiY = PAD_T + (ancestry?.length ? 22 : 8);
  const lineTop = emojiY + 6;

  return `<svg class="score-dist__svg" viewBox="0 0 ${W} ${H}">${legend}
    <g class="score-dist__bars">${bars}</g>${curves}
    <line class="score-dist__marker" x1="${mx}" x2="${mx}" y1="${lineTop}" y2="${H - PAD_B}" stroke-dasharray="3 2"/>
    <text class="score-dist__emoji" x="${mx}" y="${emojiY}" text-anchor="middle">${emoji}</text>
  </svg>`;
}
