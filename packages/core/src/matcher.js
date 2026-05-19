/**
 * Variant matching utilities.
 * Position-based matching, allele flipping, dosage calculation.
 * @module packages/core/src/matcher
 */

/**
 * Extract chr:pos key from a variant ID (handles chr:pos:ref:alt format).
 * @param {string} variantId
 * @returns {string|null}
 */
export function positionKey(variantId) {
  const i = variantId.indexOf(':');
  if (i === -1) return null;
  const j = variantId.indexOf(':', i + 1);
  return j === -1 ? variantId : variantId.substring(0, j);
}

/**
 * Check if alleles are flipped and return adjusted dosage.
 * @param {string} pgsRef
 * @param {string} pgsAlt
 * @param {string} dnaRef
 * @param {string} dnaAlt
 * @param {number} rawDosage
 * @returns {number|null} Adjusted dosage, or null if incompatible
 */
export function resolveAlleleDosage(pgsRef, pgsAlt, dnaRef, dnaAlt, rawDosage) {
  if (pgsRef === dnaRef && pgsAlt === dnaAlt) return rawDosage;
  if (pgsRef === dnaAlt && pgsAlt === dnaRef) return 2 - rawDosage;
  return null;
}

/**
 * Count effect alleles in a genotyped variant (0, 1, or 2).
 * @param {string} allele1
 * @param {string} allele2
 * @param {string} effectAllele
 * @returns {number}
 */
export function countEffectAlleles(allele1, allele2, effectAllele) {
  let count = 0;
  if (allele1 === effectAllele) count++;
  if (allele2 === effectAllele) count++;
  return count;
}

/**
 * Build a position-keyed Map from an array of genotyped variants.
 * @param {Array<{chromosome: string, position: number}>} variants
 * @returns {Map<string, object>}
 */
export function buildPositionMap(variants) {
  const map = new Map();
  for (const v of variants) {
    if (v.chromosome && v.position) {
      map.set(`${v.chromosome}:${v.position}`, v);
    }
  }
  return map;
}
