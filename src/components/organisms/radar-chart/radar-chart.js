/**
 * Radar chart — SVG polygon with data-driven gradient mesh fill.
 * Each category gets a color blob at its data point position.
 * Hue maps: violet (low) → blue → green → yellow → red (elevated).
 * @module components/organisms/radar-chart
 */

import { html, define } from 'hybrids';

const CX = 180,
  CY = 170,
  R = 110;

export default define({
  tag: 'radar-chart',
  categories: '',
  render: {
    value: ({ categories }) => {
      const cats = categories ? JSON.parse(categories) : [];
      if (cats.length < 3) return html`<p class="radar-chart__empty">Need 3+ categories</p>`;
      return html`<div class="radar-chart" innerHTML="${buildRadar(cats)}"></div>`;
    },
    shadow: false,
  },
});

const STOP_P = [0, 20, 40, 60, 80, 100];
const STOP_C = ['#7c3aed', '#3b82f6', '#06b6d4', '#d946ef', '#ec4899', '#f43f5e'];

/** Map percentile 0–100 to a vibrant color. Curated stops avoid muddy greens/browns. */
function pctToColor(pct) {
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < STOP_P.length - 1; i++) {
    if (p <= STOP_P[i + 1]) {
      const t = (p - STOP_P[i]) / (STOP_P[i + 1] - STOP_P[i]);
      return lerpColor(STOP_C[i], STOP_C[i + 1], t);
    }
  }
  return STOP_C[STOP_C.length - 1];
}

/**
 *
 */
function lerpColor(a, b, t) {
  const pa = [
    parseInt(a.slice(1, 3), 16),
    parseInt(a.slice(3, 5), 16),
    parseInt(a.slice(5, 7), 16),
  ];
  const pb = [
    parseInt(b.slice(1, 3), 16),
    parseInt(b.slice(3, 5), 16),
    parseInt(b.slice(5, 7), 16),
  ];
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/**
 *
 */
function buildRadar(cats) {
  const n = cats.length,
    step = (2 * Math.PI) / n,
    off = -Math.PI / 2;
  const ang = (i) => off + i * step;
  const px = (i, fr) => f(CX + R * fr * Math.cos(ang(i)));
  const py = (i, fr) => f(CY + R * fr * Math.sin(ang(i)));
  const pt = (i, fr) => `${px(i, fr)},${py(i, fr)}`;

  let grid = '';
  for (const fr of [0.25, 0.5, 0.75, 1.0]) {
    grid += `<polygon points="${Array.from({ length: n }, (_, i) => pt(i, fr)).join(' ')}" class="radar-chart__ring"/>`;
  }

  let axes = '';
  for (let i = 0; i < n; i++) {
    axes += `<line x1="${CX}" y1="${CY}" x2="${px(i, 1)}" y2="${py(i, 1)}" class="radar-chart__axis"/>`;
  }

  const fracs = cats.map((c) => Math.max(0, Math.min(100, c.avgPercentile)) / 100);
  const polyStr = cats.map((_, i) => pt(i, fracs[i])).join(' ');

  // Blobs: one per category at its data point, color = percentile hue
  let blobs = '';
  for (let i = 0; i < n; i++) {
    const x = px(i, fracs[i]),
      y = py(i, fracs[i]);
    const color = pctToColor(cats[i].avgPercentile);
    const rad = 30 + fracs[i] * 50;
    blobs += `<circle cx="${x}" cy="${y}" r="${f(rad)}" fill="${color}" opacity="0.6"/>`;
  }

  const defs = `<defs>
    <clipPath id="rc"><polygon points="${polyStr}"/></clipPath>
    <filter id="rcBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="rcNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feBlend in="SourceGraphic" mode="overlay"/>
    </filter>
  </defs>`;

  const mesh = `<g clip-path="url(#rc)">
    <rect x="0" y="0" width="360" height="340" fill="var(--color-surface)"/>
    <g filter="url(#rcBlur)">${blobs}</g>
    <rect x="0" y="0" width="360" height="340" filter="url(#rcNoise)" opacity="0.1" style="mix-blend-mode:overlay"/>
  </g>`;

  const outline = `<polygon points="${polyStr}" class="radar-chart__outline"/>`;

  let dots = '';
  for (let i = 0; i < n; i++) {
    const tip = `${cats[i].category}: ${cats[i].avgPercentile}th percentile (${cats[i].count} traits)`;
    dots += `<circle cx="${px(i, fracs[i])}" cy="${py(i, fracs[i])}" r="5" class="radar-chart__dot"><title>${tip}</title></circle>`;
  }

  let labels = '';
  for (let i = 0; i < n; i++) {
    const lr = R + 20;
    const x = f(CX + lr * Math.cos(ang(i))),
      y = f(CY + lr * Math.sin(ang(i)));
    const anchor =
      Math.abs(Math.cos(ang(i))) < 0.15 ? 'middle' : Math.cos(ang(i)) > 0 ? 'start' : 'end';
    const dy = Math.sin(ang(i)) > 0.3 ? '1em' : Math.sin(ang(i)) < -0.3 ? '-0.3em' : '0.35em';
    labels += `<text x="${x}" y="${y}" text-anchor="${anchor}" dy="${dy}" class="radar-chart__label">${cats[i].category}</text>`;
  }

  const mid = `<text x="${CX + 4}" y="${f(CY - R * 0.5 - 2)}" class="radar-chart__ring-label">50th</text>`;
  return `<svg viewBox="0 0 360 340" class="radar-chart__svg">${defs}${grid}${axes}${mesh}${outline}${dots}${labels}${mid}</svg>`;
}

const f = (n) => Math.round(n * 10) / 10;
