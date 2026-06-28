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

export function geneCard(gene) {
  const hue = geneHue(gene);
  const emoji = gene.emoji || '';
  return html`
    <a href="${`/gene/${gene.symbol}`}" class="explore-grid__link">
      <div class="explore-grid__card" style="--card-hue: ${hue};">
        <div class="explore-grid__card-header">
          <span class="explore-grid__symbol">${emoji ? emoji + ' ' : ''}${gene.symbol}</span>
          <span class="explore-grid__chr">chr${gene.chr}</span>
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
