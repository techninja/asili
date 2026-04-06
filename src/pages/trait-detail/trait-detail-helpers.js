/**
 * Trait detail helpers — family loading and PGS entry building.
 * @module pages/trait-detail/trait-detail-helpers
 */

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
  } catch {
    /* no family data */
  }
}
