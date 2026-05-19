/**
 * Mini bell curve — SVG showing percentile positions on a normal distribution.
 * Emojis sit in a row above the curve with angled connector lines to their
 * actual positions. Active individual is prioritized and larger.
 * @module components/atoms/mini-curve
 */

import { html, define } from 'hybrids';

const PAD = 10;
const W = 160;
const VW = W + PAD * 2;
const EMOJI_ROW = 12; // y baseline for emoji text
const CURVE_TOP = 26; // top of curve drawing area
const CB = 78; // curve baseline
const H = 82;
const CR = CB - CURVE_TOP;
const PM = 1 / Math.sqrt(2 * Math.PI);
const ACTIVE_SIZE = 13;
const OTHER_SIZE = 10;
const MIN_GAP = 13; // min horizontal gap between emoji centers

function pdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

const CURVE = (() => {
  const pts = [];
  for (let i = 0; i <= W; i += 2) {
    const x = i + PAD;
    const z = (i / W - 0.5) * 8;
    pts.push(`${x},${(CB - (pdf(z) / PM) * CR).toFixed(1)}`);
  }
  return `M${PAD},${CB} L${pts.join(' L')} L${W + PAD},${CB} Z`;
})();

function toX(pct) {
  return PAD + (Math.max(1, Math.min(99, pct)) / 100) * W;
}

function toY(pct) {
  const z = (Math.max(1, Math.min(99, pct)) / 100 - 0.5) * 8;
  return CB - (pdf(z) / PM) * CR;
}

function col(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct <= 30) return '#ef4444';
  return '#3b82f6';
}

/**
 * Resolve emoji horizontal positions so none overlap.
 * Active individual is FIXED at its true position; others nudge around it.
 */
function resolveRow(activePct, others) {
  const activeX = toX(activePct);

  // Others sorted by true x
  const items = others
    .map(m => ({ p: m.p, e: m.e, n: m.n || '', trueX: toX(m.p) }))
    .sort((a, b) => a.trueX - b.trueX);

  // Place others, treating active position as an immovable obstacle
  const displayX = items.map(it => it.trueX);

  // Insert active as a fixed obstacle for gap calculations
  const obstacles = [{ x: activeX, fixed: true }];
  
  // Forward pass: ensure min gap between all items
  for (let i = 0; i < displayX.length; i++) {
    // Check against active
    if (Math.abs(displayX[i] - activeX) < MIN_GAP) {
      // Push away from active
      displayX[i] = displayX[i] < activeX
        ? activeX - MIN_GAP
        : activeX + MIN_GAP;
    }
    // Check against previous other
    if (i > 0 && displayX[i] - displayX[i - 1] < MIN_GAP) {
      displayX[i] = displayX[i - 1] + MIN_GAP;
    }
  }

  // Backward pass: pull back items past right edge
  for (let i = displayX.length - 1; i >= 0; i--) {
    displayX[i] = Math.min(displayX[i], VW - PAD);
    if (i < displayX.length - 1 && displayX[i + 1] - displayX[i] < MIN_GAP) {
      displayX[i] = displayX[i + 1] - MIN_GAP;
    }
  }

  // Clamp left
  for (let i = 0; i < displayX.length; i++) {
    displayX[i] = Math.max(displayX[i], PAD);
    if (i > 0 && displayX[i] - displayX[i - 1] < MIN_GAP) {
      displayX[i] = displayX[i - 1] + MIN_GAP;
    }
  }

  return items.map((it, i) => ({ ...it, displayX: displayX[i] }));
}

function buildSvg(pct, indEmoji, markers, dimmed) {
  const others = markers ? JSON.parse(markers) : [];
  const c = col(pct);
  const resolved = resolveRow(pct, others);
  const activeX = toX(pct);

  let s = `<svg viewBox="0 0 ${VW} ${H}" class="mini-curve">`;
  s += `<path d="${CURVE}" fill="var(--color-surface-alt)" stroke="var(--color-border)" stroke-width="0.5"/>`;

  // Draw others first (behind active)
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

  // Active — always at its true position, straight vertical line
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
        onclick="${(host) => { host.dimmed = !host.dimmed; }}"
      ></div>`;
    },
    shadow: false,
  },
});
