/**
 * Trait detail helpers — family loading, PGS entries, section renderers.
 * @module pages/trait-detail/trait-detail-helpers
 */

import { html } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { getActiveId } from '#pages/app/results-store.js';

/**
 * Build PGS entries for the comparison table from result data.
 * @param {object} r - Trait result
 * @returns {Array<object>}
 */
export function buildPgsEntries(r) {
  return Object.entries(r.pgsDetails)
    .map(([id, d]) => ({
      id,
      r2: d.performanceMetric,
      zScore: d.zScore,
      coverage: d.coverage,
      qualityScore: d.qualityScore,
      isBest: id === r.bestPGS,
    }))
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
    .slice(0, 5);
}

/**
 * Load family comparison data for a trait from IndexedDB.
 * @param {object} host
 */
export async function loadFamily(host) {
  try {
    await idb.openDB();
    const individuals = await idb.getAll('individuals');
    const activeId = getActiveId();
    const keys = await idb.getAllKeys('results');
    const family = [];
    for (const ind of individuals) {
      if (ind.id === activeId) continue;
      const key = `${ind.id}:${host.traitId}`;
      if (keys.includes(key)) {
        const r = await idb.get('results', key);
        if (r) family.push({ name: ind.name, emoji: ind.emoji, percentile: r.percentile || 0 });
      }
    }
    host.familyData = family;
  } catch (e) {
    console.error(e);
    /* no family data */
  }
}

/** @param {object} r */
export function riskBalance(r) {
  const best = r.pgsDetails?.[r.bestPGS];
  if (!best?.positive_sum) return html``;
  const total = Math.abs(best.positive_sum) + Math.abs(best.negative_sum);
  const pct = total > 0 ? Math.round((Math.abs(best.positive_sum) / total) * 100) : 50;
  const posN = (best.positive_variants || 0).toLocaleString();
  const negN = (best.negative_variants || 0).toLocaleString();
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="scale"></app-icon> Risk vs Protective</h2>
      <div class="trait-detail__balance-bar">
        <div class="trait-detail__balance-risk" style="${{ width: `${pct}%` }}"></div>
      </div>
      <p class="trait-detail__meta">
        ${posN} risk variants (${pct}%) · ${negN} protective (${100 - pct}%)
      </p>
    </section>
  `;
}

/** @param {object} r */
/** Chromosome coverage chart for the best PGS. */
export function chrCoverageSection(r, isImputed = true) {
  const bestPgs = r.bestPGS;
  const bd = bestPgs && r.pgsBreakdown?.[bestPgs];
  const det = bestPgs && r.pgsDetails?.[bestPgs];
  if (!bd?.chromosomeCoverage) return html``;
  const cov = det?.coverage || 0;
  const totals = bd.chromosomeTotals || {};
  const hasTotals = Object.keys(totals).length > 0;
  const finalTotals = hasTotals ? totals : {};
  if (!hasTotals && cov > 0 && cov < 1) {
    for (const [chr, matched] of Object.entries(bd.chromosomeCoverage)) {
      finalTotals[chr] = Math.round(matched / cov);
    }
  }
  const data = JSON.stringify({ matched: bd.chromosomeCoverage, totals: finalTotals });
  const showUpsell = !isImputed && cov < 0.5;
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="dna"></app-icon> Chromosome Coverage</h2>
      <chr-coverage data="${data}"></chr-coverage>
      ${showUpsell
        ? html`<p class="trait-detail__upsell">
            <app-icon name="zap" size="sm"></app-icon>
            Raw DNA covers ${Math.round(cov * 100)}% of variants for this trait.
            <a href="https://impute.asili.dev" target="_blank" rel="noopener">Impute your data</a>
            to unlock 60–80% coverage for more accurate scores.
          </p>`
        : html``}
    </section>
  `;
}

const SOURCE_LABELS = { traits: 'Traits', table: 'Table', report: 'Report' };

/** Get the label for the source tab the user came from. */
export function sourceLabel() {
  const source = sessionStorage.getItem('asili-source-tab') || 'traits';
  return SOURCE_LABELS[source] || 'Traits';
}

/** @param {object} t */
export function coverStyle(t) {
  if (!t?.cover_image?.thumb) return {};
  return {
    'background-image': `linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.15) 50%, transparent 100%), url(${t.cover_image.thumb})`,
    'background-size': 'cover',
    'background-position': 'center',
  };
}

/** @param {object} t */
export function coverAttribution(t) {
  if (!t?.cover_image?.photographer) return html``;
  const url = `https://unsplash.com/@${t.cover_image.photographer_username}?utm_source=asili&utm_medium=referral`;
  return html`<a href="${url}" target="_blank" rel="noopener" class="trait-detail__attribution"
    >📷 ${t.cover_image.photographer}</a
  >`;
}
