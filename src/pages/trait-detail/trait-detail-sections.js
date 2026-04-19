/**
 * Trait detail scored/insufficient content sections.
 * @module pages/trait-detail/trait-detail-sections
 */

import { html } from 'hybrids';
// @ts-ignore
import '#atoms/aqs-breakdown/aqs-breakdown.js';
// @ts-ignore
import '#atoms/score-distribution/score-distribution.js';
// @ts-ignore
import '#atoms/chr-contribution/chr-contribution.js';
import { buildPgsEntries, riskBalance, chrCoverageSection } from './trait-detail-helpers.js';
import { topVariantsSection } from './trait-detail-variants.js';

const NULL_CONF = ['none', 'insufficient', ''];

/** @param {object} r @param {object|null} t @param {Array} fd @param {object} pm @param {string} [ie] */
export function scoredContent(r, t, fd, pm, ie) {
  if (NULL_CONF.includes(r.confidence || '')) return insufficientContent(r);
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  const totalVars =
    pm?.variantsNumber || Math.round((det?.matchedVariants || 0) / (det?.coverage || 1));
  const pgsEntries = r.pgsDetails ? buildPgsEntries(r) : [];
  const pgsLink = r.bestPGS ? `https://www.pgscatalog.org/score/${r.bestPGS}` : '';
  return html`
    <div class="trait-detail__grid">
      ${bestPgsSection(r, det, pm, pgsLink, totalVars)} ${aqsSection(det, totalVars)}
      ${distributionSection(r, ie)} ${pgsEntries.length > 0 ? pgsTableSection(pgsEntries) : html``}
      ${riskBalance(r)} ${chrContributionSection(r)} ${topVariantsSection(r, ie)}
      ${chrCoverageSection(r)} ${fd?.length > 0 ? familySection(fd) : html``}
    </div>
  `;
}

/** @param {object} r @param {object} det @param {object} pm @param {string} link @param {number} total */
function bestPgsSection(r, det, pm, link, total) {
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
      ${pm?.method
        ? html`<p class="trait-detail__meta">
            ${pm.method}${pm?.weightType ? ` · ${pm.weightType}` : ''}
          </p>`
        : html``}
      <p class="trait-detail__meta">
        ${(det?.matchedVariants || 0).toLocaleString()} / ${total.toLocaleString()} variants
        (${Math.round((det?.coverage || 0) * 100)}%)
      </p>
    </section>
  `;
}

/** @param {object} det @param {number} totalVars */
function aqsSection(det, totalVars) {
  if (!det) return html``;
  const data = JSON.stringify({
    matched: det.matchedVariants || 0,
    total: totalVars,
    r2: det.performanceMetric || 0,
    hasNorm: det.normSd !== undefined && det.coverage >= 0.05,
    z: det.zScore,
    genotyped: det.genotypedVariants || 0,
  });
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="sparkles"></app-icon> Asili Quality Score</h2>
      <aqs-breakdown data="${data}"></aqs-breakdown>
    </section>
  `;
}

/** @param {object} r @param {string} [ie] */
function distributionSection(r, ie) {
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
function chrContributionSection(r) {
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
function pgsTableSection(entries) {
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="chart-stacked"></app-icon> PGS Comparison</h2>
      <pgs-table pgsData="${JSON.stringify(entries)}"></pgs-table>
    </section>
  `;
}

/** @param {Array} fd */
function familySection(fd) {
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="compare"></app-icon> Family Comparison</h2>
      <family-compare individuals="${JSON.stringify(fd)}"></family-compare>
    </section>
  `;
}

/** @param {object} r */
export function insufficientContent(r) {
  return html`
    <section class="trait-detail__section">
      <h2>Score</h2>
      <p class="trait-detail__nodata">No variant matches for this trait.</p>
      <p class="trait-detail__upsell">
        Imputation typically unlocks 60–80% coverage for more accurate scores.
      </p>
    </section>
    ${topVariantsSection(r)}
  `;
}
