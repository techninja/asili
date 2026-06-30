/**
 * Gene stats extraction — queries DuckDB for per-gene variant stats.
 * @module utils/profile-gene-stats
 */

import * as ddb from '/packages/core/src/duckdb/adapter.js';
import { getGeneLoci } from './gene-loci.js';

/**
 * @param {string[]} chrFiles
 * @returns {Promise<Record<string, {total:number, imputed:number, genotyped:number, nonref:number}>>}
 */
export async function extractGeneStats(chrFiles) {
  const geneLoci = await getGeneLoci();
  /** @type {Record<string, {total:number, imputed:number, genotyped:number, nonref:number}>} */
  const geneStats = {};
  if (!geneLoci.length) return geneStats;

  for (const g of geneLoci) {
    const f = chrFiles.find((fn) => {
      const n = fn.match(/chr([0-9XY]+)/i)?.[1] || '';
      return n === g.chr;
    });
    if (!f) continue;
    const ref = f.startsWith('_') ? f : `'${f}'`;
    try {
      const rows = await ddb.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN imputed THEN 1 END) AS imputed,
          COUNT(CASE WHEN NOT imputed THEN 1 END) AS genotyped,
          COUNT(CASE WHEN genotype_dosage > 0.5 THEN 1 END) AS nonref
        FROM ${ref}
        WHERE pos >= ${g.start} AND pos <= ${g.end}
      `);
      if (rows.length && Number(rows[0].total) > 0) {
        geneStats[g.symbol] = {
          total: Number(rows[0].total),
          imputed: Number(rows[0].imputed),
          genotyped: Number(rows[0].genotyped),
          nonref: Number(rows[0].nonref),
        };
      }
    } catch {
      /* skip */
    }
  }
  return geneStats;
}
