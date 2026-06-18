/**
 * Trait manifest loader — fetches once, caches in memory.
 * @module utils/manifest
 */

import { DATA_BASE } from '#utils/data-url.js';

/** @type {object|null} */
let cache = null;

/** @type {Promise<object>|null} */
let pending = null;

/**
 * Load the trait manifest (cached after first call).
 * @param {string} [url]
 * @returns {Promise<object>}
 */
export function loadManifest(url = `${DATA_BASE}/trait_manifest.json`) {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache = data;
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
 * Get sorted trait list from cached manifest.
 * @returns {Promise<Array<object>>}
 */
export async function getTraitList() {
  const m = await loadManifest();
  return Object.values(m.traits).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get PGS metadata by ID from cached manifest.
 * @param {string} pgsId
 * @returns {Promise<object|null>}
 */
export async function getPgsMeta(pgsId) {
  const m = await loadManifest();
  return m.pgs?.[pgsId] || null;
}

/** Reset cache (for testing). */
export function resetManifest() {
  cache = null;
  pending = null;
}

/** @type {Map<string, object>} */
const detailCache = new Map();

/**
 * Fetch rich PGS detail from per-file JSON. Cached after first call per ID.
 * @param {string} pgsId
 * @returns {Promise<object|null>}
 */
export async function getPgsDetail(pgsId) {
  if (detailCache.has(pgsId)) return detailCache.get(pgsId);
  try {
    const r = await fetch(`${DATA_BASE}/pgs_detail/${pgsId}.json`);
    if (!r.ok) return null;
    const data = await r.json();
    detailCache.set(pgsId, data);
    return data;
  } catch {
    return null;
  }
}
