/**
 * hg19→hg38 liftover loader — fetches and registers liftover parquets.
 * Cached for the session. Used by loadGenotypedDNA for raw DNA files.
 * @module utils/liftover
 */

import { registerBuffer, dropFile } from '/packages/core/src/duckdb/adapter.js';
import { parseTar } from './score-trait.js';

/** @type {Map<string, string>|null} */
let cache = null;

/**
 * Fetch hg19→hg38 liftover .asili, register per-chr parquets in DuckDB.
 * Returns cached result on subsequent calls.
 * @returns {Promise<Map<string, string>>} chr label → registered filename
 */
export async function loadLiftover() {
  if (cache) return cache;
  const resp = await fetch(`${window.location.origin}/data/hg19map.asili`);
  if (!resp.ok) {
    console.warn('No hg19map.asili — scoring without liftover');
    cache = new Map();
    return cache;
  }
  const tarBuf = await resp.arrayBuffer();
  const entries = await parseTar(new File([tarBuf], 'hg19map.asili'));
  cache = new Map();
  for (const e of entries) {
    if (!e.name.endsWith('.parquet')) continue;
    const label = e.name.replace('chr', '').replace('.parquet', '');
    const regName = `liftover_${e.name}`;
    await registerBuffer(regName, tarBuf.slice(e.offset, e.offset + e.size));
    cache.set(label, regName);
  }
  return cache;
}

/** Drop all registered liftover files and clear cache. */
export async function dropLiftover() {
  if (!cache) return;
  for (const name of cache.values()) await dropFile(name);
  cache = null;
}
