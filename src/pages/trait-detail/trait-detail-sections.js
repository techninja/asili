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
import {
  distributionSection,
  chrContributionSection,
  pgsTableSection,
  familySection,
  bestPgsSection,
} from './trait-detail-secondary.js';

const NULL_CONF = ['none', 'insufficient', ''];

/** @param {object} r @param {object|null} t @param {Array} fd @param {object} pm @param {string} [ie] */
export function scoredContent(r, t, fd, pm, ie, isImputed = true) {
  if (NULL_CONF.includes(r.confidence || '')) return insufficientContent(r);
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  const totalVars =
    pm?.variants ||
    pm?.variantsNumber ||
    Math.round((det?.matchedVariants || 0) / (det?.coverage || 1));
  const pgsEntries = r.pgsDetails ? buildPgsEntries(r) : [];
  const pgsLink = r.bestPGS ? `https://www.pgscatalog.org/score/${r.bestPGS}` : '';
  return html`
    <div class="trait-detail__grid">
      ${bestPgsSection(r, det, pm, pgsLink, totalVars)} ${aqsSection(det, totalVars)}
      ${distributionSection(r, ie)} ${pgsEntries.length > 0 ? pgsTableSection(pgsEntries) : html``}
      ${riskBalance(r)} ${chrContributionSection(r)} ${topVariantsSection(r, ie)}
      ${chrCoverageSection(r, isImputed)} ${fd?.length > 0 ? familySection(fd) : html``}
    </div>
  `;
}

/** @param {object} r @param {object} det @param {object} pm @param {string} link @param {number} total */
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
      <div class="trait-detail__section-header">
        <h2><app-icon name="sparkles"></app-icon> Asili Quality Score</h2>
        <a
          href="https://asili.dev/quality"
          target="_blank"
          rel="noopener"
          class="trait-detail__help-link"
          title="How is this calculated?"
        >
          <app-icon name="help-circle" size="sm"></app-icon>
        </a>
      </div>
      <aqs-breakdown data="${data}"></aqs-breakdown>
    </section>
  `;
}

/** @param {object} r @param {string} [ie] */

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
