/**
 * Chromosome rail strip — builds an SVG data URI for the density/quality visualization.
 * @module pages/gene-detail/gene-detail-strip
 */

import { html } from 'hybrids';

/** DR2 confidence tier color: 0–1 normalized range → hue spectrum. */
function dr2ConfidenceColor(t) {
  if (t === null || t === undefined) return 'transparent';
  if (t === 0) return 'rgb(20 20 30)';
  const c = Math.pow(t, 0.7);
  return `hsl(${c * 300}, 95%, ${30 + c * 35}%)`;
}

function rawCoverageColor(count, maxCount) {
  if (!count) return 'transparent';
  const t = Math.log1p(count) / Math.log1p(maxCount);
  // Any bin with data gets color — sparse arrays need visibility
  const c = Math.pow(t, 0.4);
  const h = 260 - c * 40;
  const s = 60 + c * 30;
  const l = 20 + c * 45;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function buildVerticalStrip(dr2, coverage) {
  const hasDr2 = !!dr2 && dr2.length > 0;
  const bins = hasDr2 ? dr2 : coverage;
  if (!bins || !bins.length) {
    return html`<div class="chr-rail__strip chr-rail__strip--empty"></div>`;
  }
  const n = bins.length;
  let rects;
  if (hasDr2) {
    const valid = bins.filter((v) => v !== null && v !== undefined && v > 0);
    const min = valid.length ? Math.min(...valid) : 0;
    const max = valid.length ? Math.max(...valid) : 1;
    const range = max - min || 1;
    rects = bins
      .map((val, i) => {
        if (val === null || val === undefined || val === 0)
          return `<rect x="0" y="${i}" width="1" height="1" fill="transparent"/>`;
        const t = (val - min) / range;
        return `<rect x="0" y="${i}" width="1" height="1" fill="${dr2ConfidenceColor(t)}"/>`;
      })
      .join('');
  } else {
    const max = Math.max(...bins.filter(Boolean), 1);
    rects = bins
      .map(
        (val, i) =>
          `<rect x="0" y="${i}" width="1" height="1" fill="${rawCoverageColor(val, max)}"/>`,
      )
      .join('');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 ${n}" preserveAspectRatio="none">${rects}</svg>`;
  return html`<img class="chr-rail__strip" src="data:image/svg+xml,${encodeURIComponent(svg)}" />`;
}
