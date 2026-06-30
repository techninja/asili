/**
 * Chromosome rail rendering for gene detail view.
 * @module pages/gene-detail/gene-detail-rail
 */

import { html } from 'hybrids';
import { buildVerticalStrip } from './gene-detail-strip.js';
// @ts-ignore
import '#atoms/chr-ideogram/chr-ideogram.js';

/** Approximate chromosome lengths (hg38, Mbp). */
const CHR_LENGTHS = {
  1: 249, 2: 242, 3: 198, 4: 190, 5: 182, 6: 171, 7: 159, 8: 145,
  9: 138, 10: 134, 11: 135, 12: 133, 13: 114, 14: 107, 15: 102,
  16: 90, 17: 83, 18: 80, 19: 59, 20: 64, 21: 47, 22: 51, X: 156, Y: 57,
};

/** Cumulative genome offsets (Mbp) for hue mapping. */
const CHR_OFFSETS = {
  1: 0, 2: 249, 3: 491, 4: 689, 5: 879, 6: 1061, 7: 1232, 8: 1391,
  9: 1536, 10: 1674, 11: 1808, 12: 1943, 13: 2076, 14: 2190, 15: 2297,
  16: 2399, 17: 2489, 18: 2572, 19: 2652, 20: 2711, 21: 2775, 22: 2822, X: 2873,
};

function chrHueRange(chr) {
  const startOff = (CHR_OFFSETS[chr] || 0) * 1e6;
  const endOff = startOff + (CHR_LENGTHS[chr] || 100) * 1e6;
  return {
    start: `hsl(${(startOff / 3.1e9) * 360}, 70%, 55%)`,
    end: `hsl(${(endOff / 3.1e9) * 360}, 70%, 55%)`,
  };
}

/** Vertical chromosome rail with quality strip + neighboring gene labels. */
export function chrRail(gene, profile) {
  const chrLen = (CHR_LENGTHS[gene.chr] || 150) * 1e6;
  const dr2 = profile?.dr2Bins?.[gene.chr] || null;
  const coverage = profile?.regionCoverage?.[gene.chr] || null;
  const isRaw = !dr2 && !!coverage;

  const allGenes = /** @type {any} */ (window).__asiliGeneCatalog?.genes || [];
  const siblings = allGenes.filter((g) => g.chr === gene.chr).sort((a, b) => a.start - b.start);

  const ticks = siblings.map((g) => ({
    symbol: g.symbol,
    truePct: (g.start / chrLen) * 100,
    labelPct: (g.start / chrLen) * 100,
    isCurrent: g.symbol === gene.symbol,
  }));
  const MIN_GAP = Math.max(2.5, 100 / (ticks.length * 3));
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].labelPct - ticks[i - 1].labelPct < MIN_GAP)
      ticks[i].labelPct = ticks[i - 1].labelPct + MIN_GAP;
  }
  for (let i = ticks.length - 1; i > 0; i--) {
    if (ticks[i].labelPct > 97) ticks[i].labelPct = 97;
    if (ticks[i].labelPct - ticks[i - 1].labelPct < MIN_GAP)
      ticks[i - 1].labelPct = ticks[i].labelPct - MIN_GAP;
  }
  for (const t of ticks) t.labelPct = Math.min(97, Math.max(1, t.labelPct));

  const stripSvg = buildVerticalStrip(dr2, coverage);
  const linesSvg = ticks
    .map((t) => {
      const cls = t.isCurrent ? 'chr-rail__svg-active' : 'chr-rail__svg-dim';
      return `<line class="chr-rail__svg-line ${cls}" x1="0" y1="${t.labelPct}" x2="100" y2="${t.truePct}"/>`;
    })
    .join('');
  const connSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="chr-rail__conn-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${linesSvg}</svg>`;

  const colors = chrHueRange(gene.chr);

  return html`
    <aside class="chr-rail ${isRaw ? 'chr-rail--raw' : ''}">
      <div class="chr-rail__header" title="Chromosome ${gene.chr}">
        <chr-ideogram chr="${gene.chr}" start-color="${colors.start}" end-color="${colors.end}"></chr-ideogram>
      </div>
      <div class="chr-rail__body">
        <div class="chr-rail__labels">
          ${ticks.map(
            (t) => html`
              <a
                href="/gene/${t.symbol}"
                class="chr-rail__label ${t.isCurrent ? 'chr-rail__label--active' : ''}"
                style="top: ${t.labelPct}%;"
                >${t.symbol}</a
              >
            `,
          )}
        </div>
        <div class="chr-rail__conn-wrap" innerHTML="${connSvg}"></div>
        <div class="chr-rail__track-clip">
          <div class="chr-rail__track">
            ${stripSvg}
            ${ticks.map(
              (t) => html`
                <a
                  href="/gene/${t.symbol}"
                  class="chr-rail__tick ${t.isCurrent ? 'chr-rail__tick--active' : ''}"
                  style="top: ${t.truePct}%;"
                >
                  <span class="chr-rail__tick-mark"></span>
                  <span class="chr-rail__tick-highlight"></span>
                </a>
              `,
            )}
          </div>
        </div>
      </div>
      <div class="chr-rail__footer">${(chrLen / 1e6).toFixed(0)} Mb</div>
    </aside>
  `;
}
