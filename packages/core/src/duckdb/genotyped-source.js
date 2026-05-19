/**
 * Genotyped DNA source — loads raw parsed variants into DuckDB tables.
 * Applies hg19→hg38 liftover via range JOIN against liftover parquets,
 * then computes allele_key + dosage for unified scoring.
 * @module packages/core/src/duckdb/genotyped-source
 */

import * as ddb from './adapter.js';

/** @deprecated Use loadGenotypedDNA instead */
export function buildPosMap(variants) {
  const map = new Map();
  for (const v of variants) {
    if (v.chromosome && v.position) map.set(`${v.chromosome}:${v.position}`, v);
  }
  return map;
}

const VALID = new Set(['A', 'C', 'G', 'T']);
const CHR_MAP = { X: 23, Y: 24, MT: 25 };

/**
 * Load raw genotyped variants into per-chromosome DuckDB tables.
 * Applies hg19→hg38 liftover if liftoverFiles map is provided.
 * @param {Array} variants - Parsed variant objects
 * @param {Function} [onProgress] - callback({ phase, done, total })
 * @param {Map<string, string>} [liftoverFiles] - chr label → registered liftover filename
 * @returns {Promise<string[]>} Table names (e.g. ['_dna_chr1', ...])
 */
export async function loadGenotypedDNA(variants, onProgress, liftoverFiles) {
  await ddb.query(`CREATE OR REPLACE TABLE _dna_stage (
    chr TINYINT, pos INTEGER, a1 VARCHAR, a2 VARCHAR
  )`);

  const BATCH = 8000;
  let inserted = 0;
  for (let i = 0; i < variants.length; i += BATCH) {
    const rows = [];
    const end = Math.min(i + BATCH, variants.length);
    for (let j = i; j < end; j++) {
      const v = variants[j];
      if (!v.chromosome || !v.position) continue;
      if (!VALID.has(v.allele1) || !VALID.has(v.allele2)) continue;
      const c = CHR_MAP[v.chromosome] || Number(v.chromosome) || 0;
      if (!c) continue;
      rows.push(`(${c},${v.position},'${v.allele1}','${v.allele2}')`);
    }
    if (rows.length) {
      await ddb.query(`INSERT INTO _dna_stage VALUES ${rows.join(',')}`);
      inserted += rows.length;
    }
    if (onProgress) onProgress({ phase: 'insert', done: inserted, total: variants.length });
  }

  const chrRows = await ddb.query('SELECT DISTINCT chr FROM _dna_stage ORDER BY chr');
  const tableNames = [];

  for (const { chr } of chrRows) {
    const c = Number(chr);
    const label = { 23: 'X', 24: 'Y', 25: 'MT' }[c] || String(c);
    const tbl = `_dna_chr${label}`;
    const liftFile = liftoverFiles?.get(label);

    // Position source: liftover range JOIN if available, otherwise raw pos
    const posExpr = liftFile
      ? `(s.pos + l.hg38_offset)` : 's.pos';
    const joinClause = liftFile
      ? `INNER JOIN '${liftFile}' l ON s.pos >= l.hg19_start AND s.pos < l.hg19_end` : '';

    await ddb.query(`CREATE OR REPLACE TABLE ${tbl} AS
      SELECT ${posExpr} AS pos,
        ('0x' || md5(LEAST(s.a1,s.a2) || ':' || GREATEST(s.a1,s.a2))[:15])::BIGINT AS allele_key,
        CASE WHEN s.a1 = s.a2 AND s.a1 = LEAST(s.a1,s.a2) THEN 0.0
             WHEN s.a1 = s.a2 THEN 2.0 ELSE 1.0 END::FLOAT AS genotype_dosage,
        false AS imputed, NULL::FLOAT AS imputation_quality
      FROM _dna_stage s ${joinClause}
      WHERE s.chr = ${c}
    `);
    tableNames.push(tbl);
    if (onProgress) onProgress({ phase: 'liftover', done: tableNames.length, total: chrRows.length });
  }

  await ddb.query('DROP TABLE _dna_stage');
  return tableNames;
}

/**
 * Drop all genotyped DNA tables.
 * @param {string[]} tableNames
 */
export async function dropGenotypedDNA(tableNames) {
  for (const t of tableNames) {
    try { await ddb.query(`DROP TABLE IF EXISTS ${t}`); }
    catch (e) { console.warn('dropGenotypedDNA:', e.message); }
  }
}
