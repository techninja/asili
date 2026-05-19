/**
 * Mini curve geometry — constants, layout, and collision resolution.
 * @module components/atoms/mini-curve/curve-layout
 */

export const PAD = 10;
export const W = 160;
export const VW = W + PAD * 2;
export const EMOJI_ROW = 12;
export const CURVE_TOP = 26;
export const CB = 78;
export const H = 82;
const CR = CB - CURVE_TOP;
const PM = 1 / Math.sqrt(2 * Math.PI);
export const ACTIVE_SIZE = 13;
export const OTHER_SIZE = 10;
const MIN_GAP = 13;

/**
 *
 */
function pdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

export const CURVE = (() => {
  const pts = [];
  for (let i = 0; i <= W; i += 2) {
    const x = i + PAD;
    const z = (i / W - 0.5) * 8;
    pts.push(`${x},${(CB - (pdf(z) / PM) * CR).toFixed(1)}`);
  }
  return `M${PAD},${CB} L${pts.join(' L')} L${W + PAD},${CB} Z`;
})();

/**
 *
 */
export function toX(pct) {
  return PAD + (Math.max(1, Math.min(99, pct)) / 100) * W;
}

/**
 *
 */
export function toY(pct) {
  const z = (Math.max(1, Math.min(99, pct)) / 100 - 0.5) * 8;
  return CB - (pdf(z) / PM) * CR;
}

/**
 *
 */
export function col(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct <= 30) return '#ef4444';
  return '#3b82f6';
}

/** Resolve emoji positions — active fixed, others spread outward. */
export function resolveRow(activePct, others) {
  const activeX = toX(activePct);
  const items = others
    .map((m) => ({ p: m.p, e: m.e, n: m.n || '', trueX: toX(m.p) }))
    .sort((a, b) => a.trueX - b.trueX);

  const left = items.filter((it) => it.trueX <= activeX);
  const right = items.filter((it) => it.trueX > activeX);

  const leftX = [];
  let boundary = activeX - MIN_GAP;
  for (let i = left.length - 1; i >= 0; i--) {
    leftX[i] = Math.min(left[i].trueX, boundary);
    boundary = leftX[i] - MIN_GAP;
  }
  for (let i = 0; i < leftX.length; i++) {
    leftX[i] = Math.max(leftX[i], PAD + i * MIN_GAP);
  }

  const rightX = [];
  boundary = activeX + MIN_GAP;
  for (let i = 0; i < right.length; i++) {
    rightX[i] = Math.max(right[i].trueX, boundary);
    boundary = rightX[i] + MIN_GAP;
  }
  for (let i = rightX.length - 1; i >= 0; i--) {
    rightX[i] = Math.min(rightX[i], VW - PAD - (rightX.length - 1 - i) * MIN_GAP);
  }

  return [
    ...left.map((it, i) => ({ ...it, displayX: leftX[i] })),
    ...right.map((it, i) => ({ ...it, displayX: rightX[i] })),
  ];
}
