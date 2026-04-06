/**
 * Category summary — groups scored traits by category for radar chart.
 * @module utils/categories
 */

export const CATEGORY_ORDER = [
  'Body',
  'Metabolism',
  'Cardiovascular',
  'Blood',
  'Cancer',
  'Metabolic',
  'Neurological',
  'Immune',
  'Digestive',
  'Lifestyle',
  'Appearance',
  'Nutrition',
  'Reproductive',
  'Other',
];

/** @type {Record<string, string>} */
export const CATEGORY_MAP = {
  Cancer: 'Cancer',
  'Cardiovascular disease': 'Cardiovascular',
  'Cardiovascular measurement': 'Cardiovascular',
  'Metabolic disorder': 'Metabolic',
  'Lipid or lipoprotein measurement': 'Metabolic',
  'Neurological disorder': 'Neurological',
  'Immune system disorder': 'Immune',
  'Digestive system disorder': 'Digestive',
  'Hematological measurement': 'Blood',
  'Body measurement': 'Body',
  'Other measurement': 'Body',
};

/**
 * Build category summaries from scored results + trait manifest.
 * @param {Record<string, object>} results - traitId → result
 * @param {Array<object>} traits - from manifest
 * @returns {Array<{category: string, avgPercentile: number, count: number, elevated: number, low: number}>}
 */
export function buildCategorySummary(results, traits) {
  const cats = {};

  for (const t of traits) {
    const r = results[t.trait_id];
    if (!r || r.percentile === null || r.percentile === undefined) continue;

    for (const rawCat of t.categories || []) {
      const cat = CATEGORY_MAP[rawCat] || rawCat;
      if (!cats[cat]) cats[cat] = { sum: 0, count: 0, elevated: 0, low: 0 };
      cats[cat].sum += r.percentile;
      cats[cat].count++;
      if (r.percentile > 75) cats[cat].elevated++;
      if (r.percentile < 25) cats[cat].low++;
    }
  }

  return Object.entries(cats)
    .map(([category, d]) => ({
      category,
      avgPercentile: Math.round(d.sum / d.count),
      count: d.count,
      elevated: d.elevated,
      low: d.low,
    }))
    .filter((d) => d.count >= 2)
    .sort((a, b) => b.count - a.count);
}
