/**
 * Trait manifest loader — fetches once, caches in memory.
 * @module utils/manifest
 */

/** @type {object|null} */
let cache = null;

/** @type {Promise<object>|null} */
let pending = null;

/**
 * Load the trait manifest (cached after first call).
 * @param {string} [url]
 * @returns {Promise<object>}
 */
export function loadManifest(url = '/data/trait_manifest.json') {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(url)
    .then((r) => r.json())
    .then((data) => {
      cache = data;
      pending = null;
      return data;
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

/** Reset cache (for testing). */
export function resetManifest() {
  cache = null;
  pending = null;
}
