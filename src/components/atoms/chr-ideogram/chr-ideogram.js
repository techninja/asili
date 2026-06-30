/**
 * Chromosome ideogram — simplified karyotype SVG icon.
 * Shows relative centromere position as a pinched pill shape.
 * Accepts color theming via startColor/endColor for gradient fill.
 *
 * Usage:
 *   <chr-ideogram chr="2"></chr-ideogram>
 *   <chr-ideogram chr="X" start-color="hsl(280,80%,55%)" end-color="hsl(310,80%,55%)"></chr-ideogram>
 *
 * @module components/atoms/chr-ideogram
 */

import { html, svg, define } from 'hybrids';

/** Centromere positions (hg38, approximate Mbp) per chromosome. */
const CHR_DATA = {
  1: { len: 249, cen: 124 }, 2: { len: 242, cen: 93 },
  3: { len: 198, cen: 91 }, 4: { len: 190, cen: 50 },
  5: { len: 182, cen: 49 }, 6: { len: 171, cen: 59 },
  7: { len: 159, cen: 60 }, 8: { len: 145, cen: 45 },
  9: { len: 138, cen: 43 }, 10: { len: 134, cen: 40 },
  11: { len: 135, cen: 53 }, 12: { len: 133, cen: 35 },
  13: { len: 114, cen: 17 }, 14: { len: 107, cen: 17 },
  15: { len: 102, cen: 19 }, 16: { len: 90, cen: 37 },
  17: { len: 83, cen: 25 }, 18: { len: 80, cen: 18 },
  19: { len: 59, cen: 26 }, 20: { len: 64, cen: 28 },
  21: { len: 47, cen: 12 }, 22: { len: 51, cen: 15 },
  X: { len: 156, cen: 61 }, Y: { len: 57, cen: 11 },
};

const H = 36;
const W = 14;

function buildPath(chr) {
  const data = CHR_DATA[chr] || { len: 100, cen: 50 };
  const cenY = (data.cen / data.len) * H;
  const fullW = W / 2;
  const pinchW = 1.5;
  const capR = 3;
  const midX = W / 2;

  return [
    `M ${midX - capR} 0`,
    `Q ${midX} 0 ${midX + capR} 0`,
    `L ${midX + fullW} ${capR}`,
    `L ${midX + fullW} ${cenY - 2}`,
    `L ${midX + pinchW} ${cenY}`,
    `L ${midX + fullW} ${cenY + 2}`,
    `L ${midX + fullW} ${H - capR}`,
    `L ${midX + capR} ${H}`,
    `Q ${midX} ${H} ${midX - capR} ${H}`,
    `L ${midX - fullW} ${H - capR}`,
    `L ${midX - fullW} ${cenY + 2}`,
    `L ${midX - pinchW} ${cenY}`,
    `L ${midX - fullW} ${cenY - 2}`,
    `L ${midX - fullW} ${capR}`,
    'Z',
  ].join(' ');
}

function buildSvgString(chr, startColor, endColor, showLabel) {
  const totalH = showLabel ? H + 14 : H;
  const path = buildPath(chr);
  const data = CHR_DATA[chr] || { len: 100, cen: 50 };
  const cenY = (data.cen / data.len) * H;
  const hasGradient = startColor && endColor;
  const gradId = `chr-grad-${chr}`;
  const fill = hasGradient ? `url(#${gradId})` : 'var(--color-text-muted, #6b7280)';

  const gradDef = hasGradient
    ? `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${startColor}"/><stop offset="100%" stop-color="${endColor}"/></linearGradient></defs>`
    : '';
  const label = showLabel
    ? `<text x="${W / 2}" y="${H + 11}" text-anchor="middle" font-size="8" font-family="var(--font-mono, monospace)" fill="var(--color-text-muted, #6b7280)">${chr}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}" class="chr-ideogram" role="img" aria-label="Chromosome ${chr}">${gradDef}<path d="${path}" fill="${fill}" opacity="0.7"/><line x1="${W / 2 - 1.5}" y1="${cenY}" x2="${W / 2 + 1.5}" y2="${cenY}" stroke="var(--color-bg, #0f172a)" stroke-width="0.8" opacity="0.5"/>${label}</svg>`;
}

export default define({
  tag: 'chr-ideogram',
  chr: '1',
  startColor: '',
  endColor: '',
  showLabel: { value: true, reflect: true },
  render: {
    value: (host) => html`<span innerHTML="${buildSvgString(host.chr, host.startColor, host.endColor, host.showLabel)}"></span>`,
    shadow: false,
  },
});
