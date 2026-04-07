/**
 * Trait grid helpers — sorting, filtering, grouping.
 * @module components/organisms/trait-grid/helpers
 */

import { results } from '#pages/beta/results-store.js';
import { CATEGORY_ORDER, CATEGORY_MAP } from '#utils/categories.js';

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2, none: 3, '': 3 };

/** @param {object} a @param {object} b @param {string} sortBy */
function sortTraits(a, b, sortBy) {
  const ra = results[a.trait_id];
  const rb = results[b.trait_id];
  if (sortBy === 'percentile') return (rb?.percentile || 0) - (ra?.percentile || 0);
  if (sortBy === 'confidence')
    return (CONFIDENCE_RANK[ra?.confidence] ?? 3) - (CONFIDENCE_RANK[rb?.confidence] ?? 3);
  return a.name.localeCompare(b.name);
}

/**
 * @param {Array<object>} traits
 * @param {boolean} sortScored
 * @param {string} sortBy
 * @returns {Array<[string, Array<object>]>}
 */
export function groupByCategory(traits, sortScored, sortBy) {
  const groups = {};
  for (const t of traits) {
    const raw = t.categories?.[0] || 'Other';
    const cat = CATEGORY_MAP[raw] || raw;
    (groups[cat] ||= []).push(t);
  }
  return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => [
    c,
    groups[c].sort((a, b) => {
      if (sortScored) {
        const as = results[a.trait_id] ? 0 : 1;
        const bs = results[b.trait_id] ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return sortTraits(a, b, sortBy);
    }),
  ]);
}

/**
 * @param {Array<object>} traits
 * @param {string} search
 * @param {string} filterCategory
 * @returns {Array<object>}
 */
export function filterTraits(traits, search, filterCategory) {
  let out = traits;
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((t) => t.name.toLowerCase().includes(q));
  }
  if (filterCategory) {
    out = out.filter((t) => {
      const cat = CATEGORY_MAP[t.categories?.[0]] || t.categories?.[0] || 'Other';
      return cat === filterCategory;
    });
  }
  return out;
}

/**
 * @param {Array<object>} traits
 * @returns {string[]}
 */
export function getCategories(traits) {
  const cats = new Set();
  for (const t of traits) {
    const raw = t.categories?.[0] || 'Other';
    cats.add(CATEGORY_MAP[raw] || raw);
  }
  return CATEGORY_ORDER.filter((c) => cats.has(c));
}
