/**
 * Category summary — groups scored traits by category for radar chart.
 * Uses trait-level overrides to break up the "Other measurement" catch-all.
 * @module utils/categories
 */

/** Trait-level category overrides — keyed by trait_id. */
const TRAIT_CATEGORY = {
  EFO_0004703: 'Reproductive', // age at menarche
  EFO_0004704: 'Reproductive', // age at menopause
  EFO_0009102: 'Reproductive', // number of children
  EFO_0004697: 'Reproductive', // estradiol level
  OBA_1000840: 'Lifestyle', // alcohol consumption
  EFO_0006781: 'Lifestyle', // coffee consumption
  EFO_0006527: 'Lifestyle', // smoking status
  EFO_0008328: 'Lifestyle', // chronotype
  EFO_0007794: 'Lifestyle', // nicotine metabolite ratio
  EFO_0007660: 'Neurological', // neuroticism
  EFO_0005035: 'Neurological', // hippocampal volume
  EFO_0004695: 'Neurological', // intraocular pressure
  OBA_1000110: 'Body', // bone mineral density
  OBA_VT0001253: 'Body', // body height
  OBA_1001085: 'Body', // waist circumference
  EFO_0007777: 'Body', // basal metabolic rate
  EFO_0007825: 'Appearance', // male pattern baldness
  EFO_0004279: 'Appearance', // suntan
  OBA_VT0000188: 'Metabolic', // blood glucose
  EFO_0004620: 'Metabolic', // vitamin B12
  OBA_1000968: 'Metabolic', // vitamin D
  EFO_0004531: 'Metabolic', // uric acid
  EFO_0004713: 'Respiratory', // FEV/FVC ratio
  EFO_0004312: 'Respiratory', // lung vital capacity
  OBA_1001087: 'Cardiovascular', // heart rate
  OBA_VT0000217: 'Blood', // white blood cell count
};

/** Fallback: raw EFO category → display category. */
const CATEGORY_MAP = {
  'Body measurement': 'Body',
  'Cardiovascular measurement': 'Cardiovascular',
  'Hematological measurement': 'Blood',
  'Lipid or lipoprotein measurement': 'Lipids',
  'Inflammatory measurement': 'Immune',
  'Metabolic disorder': 'Metabolic',
  'Other measurement': 'Other',
  'Other trait': 'Other',
};

export const CATEGORY_ORDER = [
  'Body',
  'Cardiovascular',
  'Blood',
  'Lipids',
  'Metabolic',
  'Reproductive',
  'Neurological',
  'Lifestyle',
  'Respiratory',
  'Appearance',
];

/**
 * Resolve the display category for a trait.
 * @param {object} t - trait from manifest
 * @returns {string}
 */
export function resolveCategory(t) {
  if (TRAIT_CATEGORY[t.trait_id]) return TRAIT_CATEGORY[t.trait_id];
  for (const raw of t.categories || []) {
    const mapped = CATEGORY_MAP[raw];
    if (mapped && mapped !== 'Other') return mapped;
  }
  return CATEGORY_MAP[t.categories?.[0]] || 'Other';
}

/**
 * Build category summaries from scored results + trait manifest.
 * @param {Record<string, object>} results
 * @param {Array<object>} traits
 * @returns {Array<{category: string, avgPercentile: number, count: number, elevated: number, low: number}>}
 */
export function buildCategorySummary(results, traits) {
  const cats = {};
  for (const t of traits) {
    const r = results[t.trait_id];
    if (!r || r.percentile === null || r.percentile === undefined) continue;
    const cat = resolveCategory(t);
    if (!cats[cat]) cats[cat] = { sum: 0, count: 0, elevated: 0, low: 0 };
    cats[cat].sum += r.percentile;
    cats[cat].count++;
    if (r.percentile > 75) cats[cat].elevated++;
    if (r.percentile < 25) cats[cat].low++;
  }
  return CATEGORY_ORDER.filter((c) => cats[c]?.count >= 1).map((c) => ({
    category: c,
    avgPercentile: Math.round(cats[c].sum / cats[c].count),
    count: cats[c].count,
    elevated: cats[c].elevated,
    low: cats[c].low,
  }));
}
