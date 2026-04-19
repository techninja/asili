/**
 * Trait detail helpers — family loading, PGS entries, section renderers.
 * @module pages/trait-detail/trait-detail-helpers
 */

import { html } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { getActiveId } from '#pages/beta/results-store.js';

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
export function chrCoverageSection(r) {
  const bestPgs = r.bestPGS;
  const bd = bestPgs && r.pgsBreakdown?.[bestPgs];
  const det = bestPgs && r.pgsDetails?.[bestPgs];
  if (!bd?.chromosomeCoverage) return html``;
  const cov = det?.coverage || 0;
  const totals = bd.chromosomeTotals || {};
  // Fall back to estimate if totals weren't collected (old results)
  const hasTotals = Object.keys(totals).length > 0;
  const finalTotals = hasTotals ? totals : {};
  if (!hasTotals && cov > 0 && cov < 1) {
    for (const [chr, matched] of Object.entries(bd.chromosomeCoverage)) {
      finalTotals[chr] = Math.round(matched / cov);
    }
  }
  const data = JSON.stringify({ matched: bd.chromosomeCoverage, totals: finalTotals });
  return html`
    <section class="trait-detail__section">
      <h2><app-icon name="dna"></app-icon> Chromosome Coverage</h2>
      <chr-coverage data="${data}"></chr-coverage>
    </section>
  `;
}
