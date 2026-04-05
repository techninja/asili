/**
 * Genotyped-only DNA source.
 * Reads trait pack parquet via DuckDB WASM, matches against in-memory Map.
 * @module packages/core/src/duckdb/genotyped-source
 */

import { positionKey, countEffectAlleles } from '../matcher.js';
import * as ddb from './adapter.js';

/**
 * Build a position-keyed Map from parsed variants.
 * @param {Array<{chromosome: string, position: number, allele1: string, allele2: string}>} variants
 * @returns {Map<string, object>}
 */
export function buildPosMap(variants) {
  const map = new Map();
  for (const v of variants) {
    if (v.chromosome && v.position) {
      map.set(`${v.chromosome}:${v.position}`, v);
    }
  }
  return map;
}

/**
 * Match variants from a trait parquet against a genotyped position Map.
 * Yields batches of matches.
 * @param {string} traitUrl - URL/path to trait parquet
 * @param {Map<string, object>} posMap - Position-keyed variant Map
 * @param {number} [chunkSize]
 * @returns {AsyncGenerator<Array<object>>}
 */
export async function* matchGenotyped(traitUrl, posMap, chunkSize = 500000) {
  const total = await ddb.count(traitUrl);

  for (let offset = 0; offset < total; offset += chunkSize) {
    const rows = await ddb.query(
      `SELECT variant_id, effect_allele, effect_weight, pgs_id FROM '${traitUrl}' LIMIT ${chunkSize} OFFSET ${offset}`
    );

    const batch = [];
    for (const row of rows) {
      const pk = positionKey(row.variant_id);
      const v = pk ? posMap.get(pk) : null;
      if (!v) continue;
      const dosage = countEffectAlleles(v.allele1, v.allele2, row.effect_allele);
      if (dosage === 0) continue;
      batch.push({
        pgs_id: row.pgs_id, variant_id: row.variant_id,
        effect_allele: row.effect_allele, effect_weight: row.effect_weight,
        dosage, imputed: false,
      });
    }
    if (batch.length > 0) yield batch;
  }
}
