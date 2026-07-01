/**
 * Explore grid helpers — search, filter, sort, card rendering.
 * @module components/organisms/explore-grid/explore-grid-helpers
 */

import { html } from 'hybrids';

/** Genome-position chromosome offsets (Mbp cumulative). */
const chrOffsets = {
  1: 0,
  2: 249,
  3: 491,
  4: 689,
  5: 879,
  6: 1061,
  7: 1232,
  8: 1391,
  9: 1536,
  10: 1674,
  11: 1808,
  12: 1943,
  13: 2076,
  14: 2190,
  15: 2297,
  16: 2399,
  17: 2489,
  18: 2572,
  19: 2652,
  20: 2711,
  21: 2775,
  22: 2822,
  X: 2873,
};
const chrLens = {
  1: 249,
  2: 242,
  3: 198,
  4: 190,
  5: 182,
  6: 171,
  7: 159,
  8: 145,
  9: 138,
  10: 134,
  11: 135,
  12: 133,
  13: 114,
  14: 107,
  15: 102,
  16: 90,
  17: 83,
  18: 80,
  19: 59,
  20: 64,
  21: 47,
  22: 51,
  X: 156,
  Y: 57,
};

/** Map gene's genome position to a hue for visual variance. */
export function geneHue(gene) {
  const offset = (chrOffsets[gene.chr] || 0) * 1e6 + gene.start;
  return (offset / 3.1e9) * 360;
}

function matchesSearch(gene, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    gene.symbol.toLowerCase().includes(q) ||
    gene.name.toLowerCase().includes(q) ||
    gene.social_tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function filterGenes(genes, { search, category, sortBy, sortDir }) {
  let out = genes.filter((g) => {
    if (category && g.category !== category) return false;
    return matchesSearch(g, search);
  });
  out = [...out].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') cmp = a.symbol.localeCompare(b.symbol);
    else if (sortBy === 'position') cmp = geneHue(a) - geneHue(b);
    else if (sortBy === 'publications') cmp = a.publications - b.publications;
    else if (sortBy === 'category')
      cmp = a.category.localeCompare(b.category) || a.symbol.localeCompare(b.symbol);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return out;
}

/** Get start/end hue for a chromosome's genome range. */
function chrHueRange(chr) {
  const startOff = (chrOffsets[chr] || 0) * 1e6;
  const endOff = startOff + (chrLens[chr] || 100) * 1e6;
  const startHue = (startOff / 3.1e9) * 360;
  const endHue = (endOff / 3.1e9) * 360;
  return {
    start: `hsl(${startHue}, 70%, 55%)`,
    end: `hsl(${endHue}, 70%, 55%)`,
  };
}

export function geneCard(gene) {
  const hue = geneHue(gene);
  const emoji = gene.emoji || '';
  const colors = chrHueRange(gene.chr);
  return html`
    <a href="${`/gene/${gene.symbol}`}" class="explore-grid__link">
      <div class="explore-grid__card" style="--card-hue: ${hue};">
        <div class="explore-grid__card-header">
          <span class="explore-grid__symbol">${emoji ? emoji + ' ' : ''}${gene.symbol}</span>
          <chr-ideogram
            chr="${gene.chr}"
            start-color="${colors.start}"
            end-color="${colors.end}"
            show-label
          ></chr-ideogram>
        </div>
        <p class="explore-grid__name">${gene.name}</p>
        ${gene.social_tags.length
          ? html`<div class="explore-grid__tags">
              ${gene.social_tags
                .slice(0, 4)
                .map((t) => html`<span class="explore-grid__tag">${t}</span>`)}
            </div>`
          : html``}
        <div class="explore-grid__meta">
          <span class="explore-grid__cat-badge">${gene.category}</span>
          <span class="explore-grid__pubs">${gene.publications.toLocaleString()} studies</span>
        </div>
      </div>
    </a>
  `.key(gene.symbol);
}
