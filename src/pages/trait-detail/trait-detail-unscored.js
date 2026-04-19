/**
 * Trait detail unscored content — rich empty state showing trait info.
 * Displayed when no individual is loaded or trait hasn't been scored yet.
 * @module pages/trait-detail/trait-detail-unscored
 */

import { html } from 'hybrids';

/** @param {object} t - trait from manifest */
export function unscoredContent(t) {
  if (!t?.name) return html``;
  return html`
    <div class="trait-detail__grid">
      ${traitInfoSection(t)} ${whatYoullSeeSection(t)} ${t.pgs_count ? pgsInfoSection(t) : html``}
    </div>
  `;
}

/**
 *
 */
function traitInfoSection(t) {
  const cats = t.categories?.join(', ') || '';
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="info"></app-icon> About This Trait</h2>
      ${t.description ? html`<p class="trait-detail__meta">${t.description}</p>` : html``}
      <div class="trait-detail__info-grid">
        ${infoRow(
          'Type',
          t.trait_type === 'quantitative' ? 'Quantitative (measurable)' : 'Disease risk',
        )}
        ${t.unit ? infoRow('Unit', t.unit) : html``} ${cats ? infoRow('Categories', cats) : html``}
        ${t.phenotype_mean
          ? infoRow('Population avg', `${t.phenotype_mean} ${t.unit || ''}`)
          : html``}
      </div>
    </section>
  `;
}

/**
 *
 */
function whatYoullSeeSection(t) {
  const isQuant = t.trait_type === 'quantitative';
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="sparkles"></app-icon> What You'll See</h2>
      <p class="trait-detail__meta">
        Upload your DNA to unlock scoring for this trait. You'll get:
      </p>
      <ul class="trait-detail__feature-list">
        <li>
          <app-icon name="target" size="sm"></app-icon> Your percentile ranking in the population
        </li>
        <li>
          <app-icon name="bar-chart" size="sm"></app-icon> Population distribution with ancestry
          overlays
        </li>
        ${isQuant
          ? html`<li>
              <app-icon name="gauge" size="sm"></app-icon> Predicted ${t.unit || 'value'} based on
              your genetics
            </li>`
          : html``}
        <li><app-icon name="microscope" size="sm"></app-icon> Top contributing genetic variants</li>
        <li><app-icon name="git-branch" size="sm"></app-icon> Per-chromosome score breakdown</li>
        <li>
          <app-icon name="shield-check" size="sm"></app-icon> Quality score rating the reliability
          of results
        </li>
      </ul>
    </section>
  `;
}

/**
 *
 */
function pgsInfoSection(t) {
  const vars =
    t.expected_variants?.toLocaleString() || t.estimated_unique_variants?.toLocaleString() || '?';
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="database"></app-icon> Available Data</h2>
      <div class="trait-detail__info-grid">
        ${infoRow('Polygenic scores', `${t.pgs_count} PGS from the PGS Catalog`)}
        ${infoRow('Variants analyzed', `~${vars} across all PGS`)}
        ${t.reference_population ? infoRow('Reference', t.reference_population) : html``}
      </div>
    </section>
  `;
}

/**
 *
 */
function infoRow(label, value) {
  return html`
    <div class="trait-detail__info-row">
      <span class="trait-detail__info-label">${label}</span>
      <span class="trait-detail__info-value">${value}</span>
    </div>
  `;
}
