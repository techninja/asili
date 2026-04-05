/**
 * Shared results store — mutable ref for scoring results.
 * Bypasses Hybrids property system which can't handle complex objects.
 * @module pages/beta/results-store
 */

/** @type {Record<string, object>} */
export const results = {};

/** @param {string} traitId @param {object} result */
export function setResult(traitId, result) {
  results[traitId] = result;
}

/** Reset all results. */
export function clearResults() {
  for (const key of Object.keys(results)) delete results[key];
}

/** @returns {number} */
export function resultCount() {
  return Object.keys(results).length;
}
