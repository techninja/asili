/**
 * Gene detail — About This Gene section renderer.
 * @module pages/gene-detail/gene-detail-about-section
 */

import { html } from 'hybrids';

export function descriptionSection(gene) {
  const summary = gene.summary || gene.description;
  if (!summary && !gene.editorial_description) return html``;
  return html`
    <section class="gene-detail__description">
      <h2 class="gene-detail__section-title">
        <app-icon name="lightbulb" size="sm"></app-icon> About This Gene
      </h2>
      ${gene.editorial_description
        ? html`<p class="gene-detail__desc-text gene-detail__desc-text--editorial">
            ${gene.editorial_description}
          </p>`
        : html``}
      ${gene.what_it_means
        ? html`<p class="gene-detail__desc-text">
            <strong>What it does:</strong> ${gene.what_it_means}
          </p>`
        : html``}
      ${gene.carrier_note
        ? html`<p class="gene-detail__desc-text">
            <strong>Carrier context:</strong> ${gene.carrier_note}
          </p>`
        : html``}
      ${gene.actionability
        ? html`<p class="gene-detail__desc-text">
            <strong>Actionability:</strong> ${gene.actionability}
          </p>`
        : html``}
      ${gene.fun_fact
        ? html`<p class="gene-detail__desc-text gene-detail__desc-text--fun">
            💡 ${gene.fun_fact}
          </p>`
        : html``}
      ${summary && !gene.editorial_description
        ? html`<p class="gene-detail__desc-text">${summary}</p>`
        : html``}
      ${summary && gene.editorial_description
        ? html`<details class="gene-detail__ncbi-summary">
            <summary>NCBI Summary</summary>
            <p class="gene-detail__desc-text">${summary}</p>
          </details>`
        : html``}
      ${gene.aliases?.length
        ? html`<div class="gene-detail__aliases">
            <span class="gene-detail__aliases-label">Also known as:</span>
            ${gene.aliases.map((a) => html`<span class="gene-detail__alias">${a}</span>`)}
          </div>`
        : html``}
    </section>
  `;
}
