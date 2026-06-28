/**
 * Gene catalog loader — fetches popular gene data for the Explore tab.
 * @module utils/gene-catalog
 */

import { DATA_BASE } from '#utils/data-url.js';

/** @type {object|null} */
let cache = null;

/** @type {Promise<object>|null} */
let pending = null;

/**
 * Load the gene catalog (cached after first call).
 * @returns {Promise<object>}
 */
export function loadGeneCatalog() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(`${DATA_BASE}/gene_catalog.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`gene catalog fetch failed: ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache = data;
      /** @type {any} */ (window).__asiliGeneCatalog = data;
      pending = null;
      return data;
    })
    .catch((e) => {
      pending = null;
      throw e;
    });
  return pending;
}

/**
 * Get sorted gene list from cached catalog.
 * @returns {Promise<Array<object>>}
 */
export async function getGeneList() {
  const c = await loadGeneCatalog();
  return c.genes;
}

/**
 * Get available categories from catalog.
 * @returns {Promise<string[]>}
 */
export async function getGeneCategories() {
  const c = await loadGeneCatalog();
  return c.categories;
}
