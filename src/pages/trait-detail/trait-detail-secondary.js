/**
 * Trait detail secondary sections — distribution, chromosome, PGS table, family.
 * @module pages/trait-detail/trait-detail-secondary
 */

import { html } from 'hybrids';

/**
 *
 */
export function distributionSection(r, ie) {
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  if (!det || det.zScore === null || det.zScore === undefined) return html``;
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="bar-chart"></app-icon> Population Distribution</h2>
      <score-distribution
        pgsId="${r.bestPGS}"
        rawScore="${det.score || 0}"
        indEmoji="${ie || '🧬'}"
      ></score-distribution>
    </section>
  `;
}

/** @param {object} r */
export function chrContributionSection(r) {
  const bd = r.bestPGS && r.pgsBreakdown?.[r.bestPGS];
  if (!bd?.chromosomeContribution || !Object.keys(bd.chromosomeContribution).length) return html``;
  const data = JSON.stringify({
    contribution: bd.chromosomeContribution,
    imputed: bd.chromosomeImputed || {},
  });
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="git-branch"></app-icon> Score by Chromosome</h2>
      <chr-contribution data="${data}"></chr-contribution>
    </section>
  `;
}

/** @param {Array} entries */
export function pgsTableSection(entries) {
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="chart-stacked"></app-icon> PGS Comparison</h2>
      <pgs-table pgsData="${JSON.stringify(entries)}"></pgs-table>
    </section>
  `;
}

/** @param {Array} fd */
export function familySection(fd) {
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="compare"></app-icon> Family Comparison</h2>
      <family-compare individuals="${JSON.stringify(fd)}"></family-compare>
    </section>
  `;
}

/** @param {number} n */
function fmtN(n) {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 *
 */
export function bestPgsSection(r, det, pm, link, total) {
  const hasDetail = pm?.id;
  const pub = pm?.publication;
  const bestEval = pm?.evaluations?.find((e) => e.metrics?.length) || null;
  const bestMetric = bestEval?.metrics?.find((m) => m.type === 'R²') || bestEval?.metrics?.[0];
  const ancestries = pm?.ancestry?.gwas ? Object.keys(pm.ancestry.gwas).join(', ') : null;
  return html`
    <section class="trait-detail__section">
      <div class="trait-detail__section-header">
        <h2><app-icon name="award"></app-icon> Best PGS</h2>
        ${r.bestPGS
          ? html`<a href="${link}" target="_blank" rel="noopener" class="trait-detail__pgs-link"
              >${r.bestPGS}</a
            >`
          : html``}
      </div>
      ${hasDetail && pm.name ? html`<p class="trait-detail__value">${pm.name}</p>` : html``}
      ${pm?.method
        ? html`<p class="trait-detail__meta">
            ${pm.method}${pm?.weight_type
              ? ` · ${pm.weight_type}`
              : pm?.weightType
                ? ` · ${pm.weightType}`
                : ''}
          </p>`
        : html``}
      <p class="trait-detail__meta">
        ${(det?.matchedVariants || 0).toLocaleString()} / ${total.toLocaleString()} variants
        (${Math.round((det?.coverage || 0) * 100)}%)
      </p>
      ${ancestries
        ? html`<p class="trait-detail__meta">
            <app-icon name="globe" size="sm"></app-icon> GWAS ancestry: ${ancestries}
          </p>`
        : html``}
      ${pm?.samples
        ? html`<p class="trait-detail__meta">
            <app-icon name="users" size="sm"></app-icon>
            ${fmtN(pm.samples.gwas)}
            GWAS${pm.samples.training ? ` · ${fmtN(pm.samples.training)} training` : ''}${pm.samples
              .eval
              ? ` · ${fmtN(pm.samples.eval)} evaluation`
              : ''}
          </p>`
        : html``}
      ${bestMetric
        ? html`<p class="trait-detail__meta">
            <app-icon name="target" size="sm"></app-icon>
            ${bestMetric.type} =
            ${bestMetric.value.toFixed(4)}${bestEval?.ancestry
              ? ` (${bestEval.ancestry}, n=${fmtN(bestEval.n)})`
              : ''}
          </p>`
        : html``}
      ${pub
        ? html`<p class="trait-detail__meta trait-detail__meta--pub">
            ${pub.author}
            (${pub.date?.slice(0, 4)})${pub.doi
              ? html` ·
                  <a href="https://doi.org/${pub.doi}" target="_blank" rel="noopener"
                    >${pub.doi}</a
                  >`
              : html``}
          </p>`
        : html``}
    </section>
  `;
}
