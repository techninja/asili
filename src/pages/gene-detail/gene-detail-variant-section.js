/**
 * Gene detail — variant/your-data section renderer.
 * @module pages/gene-detail/gene-detail-variant-section
 */

import { html } from 'hybrids';

export function variantSection(
  gene,
  variantHits,
  variantCount,
  isImputed,
  geneStats,
  indEmoji,
  indName,
) {
  const popularCount = gene.popular_variants.length;

  if (!variantCount && !isImputed && !geneStats) {
    return html`
      <section class="gene-detail__variants gene-detail__variants--empty">
        <h2 class="gene-detail__section-title">
          <app-icon name="dna" size="sm"></app-icon> Your Data
        </h2>
        <p class="gene-detail__empty-msg">Upload DNA data to see your variants at this gene.</p>
      </section>
    `;
  }

  const nameLabel = indName ? `${indEmoji} ${indName}` : 'this individual';
  const hasContent =
    (isImputed && (geneStats || popularCount)) ||
    (!isImputed && geneStats) ||
    (!isImputed && popularCount && variantHits.length);

  if (!hasContent) return html``;

  if (isImputed) {
    return html`
      <section class="gene-detail__variants gene-detail__variants--imputed">
        <h2 class="gene-detail__section-title">
          <app-icon name="dna" size="sm"></app-icon> ${nameLabel} at ${gene.symbol}
        </h2>
        <div class="gene-detail__coverage-badge gene-detail__coverage-badge--full">
          <app-icon name="check-circle" size="sm"></app-icon>
          Full coverage (imputed)
        </div>
        ${geneStats ? geneStatsBlock(geneStats, gene) : html``}
        ${popularCount
          ? html`<p class="gene-detail__coverage-note">
              All ${popularCount} key variant${popularCount > 1 ? 's' : ''} available.
            </p>`
          : html``}
      </section>
    `;
  }

  const hitCount = variantHits.length;
  return html`
    <section class="gene-detail__variants">
      <h2 class="gene-detail__section-title">
        <app-icon name="dna" size="sm"></app-icon> ${nameLabel} at ${gene.symbol}
      </h2>
      ${geneStats ? geneStatsBlock(geneStats, gene) : html``}
      ${popularCount
        ? html`
            <div class="gene-detail__variant-summary">
              <span
                class="gene-detail__hit-count ${hitCount > 0
                  ? 'gene-detail__hit-count--found'
                  : ''}"
                >${hitCount} of ${popularCount}</span
              >
              key variant${popularCount > 1 ? 's' : ''} found
            </div>
            ${hitCount > 0
              ? html`<div class="gene-detail__hit-list">
                  ${variantHits.map(
                    (rsid) => html`<span class="gene-detail__hit-rsid">${rsid}</span>`,
                  )}
                </div>`
              : html``}
            ${hitCount === 0
              ? html`<div class="gene-detail__impute-cta">
                  <p>
                    ${indName}'s raw array doesn't cover this gene region. Imputation can fill the
                    gaps using statistical inference from reference panels.
                  </p>
                  <a
                    href="https://impute.asili.dev"
                    target="_blank"
                    rel="noopener"
                    class="gene-detail__impute-link"
                  >
                    <app-icon name="sparkles" size="sm"></app-icon>
                    Impute ${indName}'s data →
                  </a>
                </div>`
              : html``}
          `
        : html``}
    </section>
  `;
}

function geneStatsBlock(stats, gene) {
  const nonrefPct = stats.total ? ((stats.nonref / stats.total) * 100).toFixed(1) : '0';
  return html`
    <div class="gene-detail__gene-stats">
      <div class="gene-detail__gene-stat">
        <span class="gene-detail__gene-stat-val">${stats.total.toLocaleString()}</span>
        <span class="gene-detail__gene-stat-lbl">variants in region</span>
      </div>
      <div class="gene-detail__gene-stat">
        <span class="gene-detail__gene-stat-val">${stats.nonref.toLocaleString()}</span>
        <span class="gene-detail__gene-stat-lbl">non-reference (${nonrefPct}%)</span>
      </div>
      ${stats.genotyped
        ? html`<div class="gene-detail__gene-stat">
            <span class="gene-detail__gene-stat-val">${stats.genotyped.toLocaleString()}</span>
            <span class="gene-detail__gene-stat-lbl">directly genotyped</span>
          </div>`
        : html``}
    </div>
    ${gene?.nonref_interpretation
      ? html`<p class="gene-detail__nonref-note">${gene.nonref_interpretation}</p>`
      : html``}
  `;
}
