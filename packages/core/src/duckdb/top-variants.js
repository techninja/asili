/**
 * Fetch top contributing variants for a PGS from the loaded DNA + trait packs.
 * Runs after scoring while the chr files are still registered.
 * @module packages/core/src/duckdb/top-variants
 */

import * as ddb from './adapter.js';

/**
 * @param {string[]} chrFiles - DNA chromosome files/tables
 * @param {Map<string, string>} traitChrFiles - chr → trait file
 * @param {string} pgsId - PGS to fetch variants for
 * @param {number} [limit] - Max variants to return
 * @returns {Promise<Array<object>>}
 */
export async function fetchTopVariants(chrFiles, traitChrFiles, pgsId, limit = 20) {
  const ref = (name) => (name.startsWith('_') ? name : `'${name}'`);
  const all = [];

  for (const dnaChr of chrFiles) {
    const chrNum = dnaChr.match(/chr(\d+)/)?.[1] || dnaChr.replace(/[^0-9]/g, '');
    const traitChr = traitChrFiles.get(chrNum);
    if (!traitChr) continue;

    const rows = await ddb.query(`
      SELECT t.variant_id, t.effect_allele, t.effect_weight, t.pgs_id,
        d.genotype_dosage, d.imputed,
        SPLIT_PART(t.variant_id,':',3) AS ref_allele,
        SPLIT_PART(t.variant_id,':',4) AS alt_allele,
        t.effect_weight
          * CASE WHEN t.effect_allele = GREATEST(
                   SPLIT_PART(t.variant_id,':',3), SPLIT_PART(t.variant_id,':',4))
                 THEN d.genotype_dosage ELSE 2.0 - d.genotype_dosage END
          * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                 THEN SQRT(d.imputation_quality) ELSE 1.0 END
          AS contribution
      FROM '${traitChr}' t
      INNER JOIN ${ref(dnaChr)} d ON t.pos=d.pos AND t.allele_key=d.allele_key
      WHERE t.pgs_id = '${pgsId}' AND d.genotype_dosage > 0
      ORDER BY ABS(contribution) DESC
      LIMIT ${limit}
    `);
    all.push(...rows);
  }

  return all
    .sort((a, b) => Math.abs(Number(b.contribution)) - Math.abs(Number(a.contribution)))
    .slice(0, limit)
    .map((r) => ({
      variantId: r.variant_id,
      effectAllele: r.effect_allele,
      effectWeight: Number(r.effect_weight),
      dosage: Number(r.genotype_dosage),
      contribution: Number(r.contribution),
      imputed: !!r.imputed,
      genotype: buildGenotype(r),
    }));
}

/** Reconstruct diploid genotype string from alleles + dosage. */
export function buildGenotype(r) {
  const dose = Number(r.genotype_dosage);
  if (r.imputed) return `~${dose < 0.01 ? dose.toFixed(3) : dose.toFixed(1)}`;
  const ref = r.ref_allele, alt = r.alt_allele;
  if (!ref || !alt) return `×${dose.toFixed(0)}`;
  if (dose >= 1.5) return `${alt}${alt}`;
  if (dose >= 0.5) return `${ref}${alt}`;
  return `${ref}${ref}`;
}
