/**
 * PGS distribution data accessor.
 * @module utils/pgs-distribution
 */

import { getNormParams } from './score-trait.js';

const POP_LABELS = {
  NFE: 'European',
  FIN: 'Finnish',
  AFR: 'African',
  EAS: 'East Asian',
  SAS: 'South Asian',
  AMR: 'American',
  ASJ: 'Ashkenazi',
  MID: 'Middle Eastern',
};

/**
 * Get the population distribution density + ancestry curves for a PGS.
 * @param {string} pgsId
 * @returns {Promise<{bins: Array, ancestry: Array}|null>}
 */
export async function getPgsDistribution(pgsId) {
  const params = await getNormParams();
  const entry = params[pgsId];
  if (!entry?.distribution || entry.norm_mean == null || entry.norm_sd == null) return null;
  const m = entry.norm_mean,
    s = entry.norm_sd,
    d = entry.distribution;
  const lo = m - 4 * s,
    step = (8 * s) / d.length;
  const bins = d.map((density, i) => ({
    min: lo + i * step,
    max: lo + (i + 1) * step,
    density,
  }));
  const ancestry = entry.ancestry
    ? Object.entries(entry.ancestry).map(([pop, v]) => ({
        pop,
        label: POP_LABELS[pop] || pop,
        mean: v.m,
        sd: v.s,
      }))
    : [];
  return { bins, ancestry };
}
