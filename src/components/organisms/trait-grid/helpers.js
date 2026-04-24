/**
 * Trait grid helpers — sorting, filtering (flat, no grouping).
 * @module components/organisms/trait-grid/helpers
 */

import { results } from '#pages/beta/results-store.js';
import { CATEGORY_ORDER, resolveCategory } from '#utils/categories.js';

/** @param {object} t @returns {string} */
export function traitCategory(t) {
  return resolveCategory(t);
}

/** @param {Array<object>} traits @returns {string[]} */
export function getCategories(traits) {
  const cats = new Set();
  for (const t of traits) cats.add(traitCategory(t));
  return CATEGORY_ORDER.filter((c) => cats.has(c));
}

/**
 * @param {Array<object>} traits
 * @param {object} opts
 * @returns {{ visible: Array<object>, totalScored: number }}
 */
export function filterAndSort(traits, opts) {
  const { search, categories, sortBy, sortDir, scoredOnly } = opts;
  let out = traits;
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((t) => t.name.toLowerCase().includes(q));
  }
  if (categories.size > 0) {
    out = out.filter((t) => categories.has(traitCategory(t)));
  }
  const totalScored = out.filter((t) => results[t.trait_id]).length;
  if (scoredOnly) out = out.filter((t) => results[t.trait_id]);
  out = [...out].sort((a, b) => {
    const ra = results[a.trait_id],
      rb = results[b.trait_id];
    let cmp = 0;
    if (sortBy === 'percentile') cmp = (ra?.percentile || 0) - (rb?.percentile || 0);
    else if (sortBy === 'zscore') cmp = Math.abs(ra?.zScore || 0) - Math.abs(rb?.zScore || 0);
    else if (sortBy === 'scored') {
      const ta = ra?.calculatedAt || '',
        tb = rb?.calculatedAt || '';
      cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
    } else cmp = a.name.localeCompare(b.name);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return { visible: out, totalScored };
}
