/**
 * Gene detail section renderers — hero, stats, links.
 * @module pages/gene-detail/gene-detail-sections
 */

import { html } from 'hybrids';
export { variantSection } from './gene-detail-variant-section.js';
export { descriptionSection } from './gene-detail-about-section.js';

export function heroSection(gene) {
  const emoji = gene.emoji || '\u{1F9EC}';
  return html`
    <section class="gene-detail__hero">
      <div class="gene-detail__hero-main">
        <h1 class="gene-detail__title">${emoji} ${gene.symbol}</h1>
        <p class="gene-detail__subtitle">${gene.name}</p>
      </div>
      <div class="gene-detail__hero-meta">
        <span class="gene-detail__location">
          <app-icon name="map-pin" size="sm"></app-icon>
          chr${gene.chr}:${gene.start.toLocaleString()}–${gene.end.toLocaleString()}
        </span>
        <span class="gene-detail__cat-badge">${gene.category}</span>
        <span class="gene-detail__pubs">${gene.publications.toLocaleString()} publications</span>
      </div>
      ${gene.social_tags.length
        ? html`<div class="gene-detail__tags">
            ${gene.social_tags.map((t) => html`<span class="gene-detail__tag">${t}</span>`)}
          </div>`
        : html``}
    </section>
  `;
}

export function statsSection(gene) {
  const len = gene.end - gene.start;
  const lenLabel = len > 1e6 ? `${(len / 1e6).toFixed(2)} Mb` : `${(len / 1e3).toFixed(1)} kb`;
  return html`
    <section class="gene-detail__stats">
      <h2 class="gene-detail__section-title">
        <app-icon name="microscope" size="sm"></app-icon> Gene Info
      </h2>
      <div class="gene-detail__stat-grid">
        <div class="gene-detail__stat">
          <span class="gene-detail__stat-value">${lenLabel}</span>
          <span class="gene-detail__stat-label">Gene length</span>
        </div>
        ${gene.exon_count
          ? html`<div class="gene-detail__stat">
              <span class="gene-detail__stat-value">${gene.exon_count}</span>
              <span class="gene-detail__stat-label">Exons</span>
            </div>`
          : html``}
        <div class="gene-detail__stat">
          <span class="gene-detail__stat-value">${gene.popular_variants.length || '\u2014'}</span>
          <span class="gene-detail__stat-label">Key variants tracked</span>
        </div>
        <div class="gene-detail__stat">
          <span class="gene-detail__stat-value">${gene.publications.toLocaleString()}</span>
          <span class="gene-detail__stat-label">PubMed citations</span>
        </div>
        ${gene.map_location
          ? html`<div class="gene-detail__stat">
              <span class="gene-detail__stat-value">${gene.map_location}</span>
              <span class="gene-detail__stat-label">Cytogenetic band</span>
            </div>`
          : html``}
      </div>
    </section>
  `;
}

export function linksSection(gene) {
  return html`
    <section class="gene-detail__links">
      <h2 class="gene-detail__section-title">
        <app-icon name="compass" size="sm"></app-icon> Learn More
      </h2>
      <div class="gene-detail__link-list">
        ${gene.wikipedia_slug
          ? html`<a
              href="https://en.wikipedia.org/wiki/${gene.wikipedia_slug}"
              target="_blank"
              rel="noopener"
              class="gene-detail__link"
            >
              <app-icon name="external-link" size="sm"></app-icon> Wikipedia
            </a>`
          : html``}
        <a
          href="https://www.ncbi.nlm.nih.gov/gene/?term=${gene.symbol}[sym]+AND+human[orgn]"
          target="_blank"
          rel="noopener"
          class="gene-detail__link"
        >
          <app-icon name="external-link" size="sm"></app-icon> NCBI Gene
        </a>
        ${gene.mim_ids?.length
          ? html`<a
              href="https://omim.org/entry/${gene.mim_ids[0]}"
              target="_blank"
              rel="noopener"
              class="gene-detail__link"
            >
              <app-icon name="external-link" size="sm"></app-icon> OMIM
            </a>`
          : html``}
      </div>
    </section>
  `;
}
