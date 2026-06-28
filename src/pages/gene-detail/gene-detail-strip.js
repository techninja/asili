/**
 * Chromosome rail strip — builds an SVG data URI for the density/quality visualization.
 * @module pages/gene-detail/gene-detail-strip
 */

import { html } from 'hybrids';

/** DR2 confidence tier color: 0–1 normalized range → hue spectrum. */
function dr2ConfidenceColor(t) {
  if (t === null || t === undefined || t < 0.2) return 'transparent';
  const c = (t - 0.2) / 0.8;
  return `hsl(${c * 300}, 95%, ${50 + c * 15}%)`;
}

function rawCoverageColor(count, maxCount) {
  if (!count) return 'transparent';
  const t = Math.log1p(count) / Math.log1p(maxCount);
  if (t < 0.5) return 'transparent';
  const c = (t - 0.5) * 2;
  return `hsl(${c * 300}, 90%, ${45 + c * 20}%)`;
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
