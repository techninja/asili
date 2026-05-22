/**
 * Worker pool — manages DuckDB scoring sessions on the main thread.
 * Both genotyped (raw) and unified (imputed) DNA use the same SQL JOIN path.
 * @module utils/worker-pool
 * @typedef {object} WorkerSession
 * @property {boolean} ready
 * @property {boolean} dead
 * @property {boolean} scoring
 * @property {string} loadedDnaId
 * @property {boolean} aborted
 */

import { initDuckDB, registerBuffer, closeDuckDB } from '/packages/core/src/duckdb/adapter.js';
import { loadGenotypedDNA, dropGenotypedDNA } from '/packages/core/src/duckdb/genotyped-source.js';
import { loadUnifiedDNA, resetUnifiedDNA } from '/packages/core/src/duckdb/unified-source.js';
import { scoreUnifiedTrait, parseTar } from './score-trait.js';
import { loadLiftover, dropLiftover } from './liftover.js';
import { isDev } from '#utils/data-url.js';

/** @type {boolean} */ let dbReady = false;
/** @type {string[]|null} */ let genotypedTables = null;
/** @type {WorkerSession[]} */ let pool = [];

/** @returns {WorkerSession} */
function createSession() {
  return { ready: false, dead: false, scoring: false, loadedDnaId: '', aborted: false };
}

/** @param {WorkerSession} s */
export async function initSession(s) {
  if (!dbReady) {
    const duckdbBase = isDev
      ? `${window.location.origin}/deps/duckdb`
      : 'https://data.asili.dev/deps/duckdb';
    await initDuckDB(duckdbBase);
    dbReady = true;
  }
  s.ready = true;
  s.dead = false;
}

/**
 * Load DNA into DuckDB for scoring.
 * @param {WorkerSession} s @param {Array|null} variants @param {File} [file]
 * @param {Function} [onProgress] - callback({ phase, done, total })
 */
export async function loadDNA(s, variants, file, onProgress) {
  if (genotypedTables) {
    await dropGenotypedDNA(genotypedTables);
    genotypedTables = null;
  }
  await resetUnifiedDNA();

  if (file) {
    const entries = await parseTar(file);
    const prefix = `dna_${Date.now()}_`;
    for (const e of entries) {
      if (!e.name.endsWith('.parquet')) continue;
      const buf = await file.slice(e.offset, e.offset + e.size).arrayBuffer();
      if (buf.byteLength !== e.size) {
        console.error(`[loadDNA] ${e.name}: expected ${e.size} bytes, got ${buf.byteLength}`);
      }
      await registerBuffer(prefix + e.name, buf);
    }
    await loadUnifiedDNA(
      entries.filter((e) => e.name.endsWith('.parquet')).map((e) => prefix + e.name),
    );
    await new Promise((r) => setTimeout(r, 200));
  } else {
    const liftoverFiles = await loadLiftover();
    genotypedTables = await loadGenotypedDNA(variants, onProgress, liftoverFiles);
    await loadUnifiedDNA(genotypedTables);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** @param {WorkerSession} s @param {Array} traits @param {string} base @param {object} cb */
export async function scoreAll(s, traits, base, cb = {}) {
  s.scoring = true;
  s.aborted = false;
  try {
    for (let i = 0; i < traits.length; i++) {
      if (s.aborted) break;
      const t = traits[i];
      if (cb.onProgress) cb.onProgress({ traitName: t.name, chrDone: 0, chrTotal: 0 });
      await new Promise((r) => setTimeout(r, 0));
      try {
        const url = `${base}/${t.file_path}`;
        const result = await scoreUnifiedTrait(url, t, cb.onProgress);
        result.calculatedAt = new Date().toISOString();
        if (cb.onTraitScored) await cb.onTraitScored({ traitId: t.trait_id, result });
      } catch (err) {
        console.error(`Scoring error for ${t.trait_id}:`, err.message);
        if (cb.onTraitError) cb.onTraitError({ traitId: t.trait_id, error: err.message });
      }
    }
  } finally {
    s.scoring = false;
  }
}

/** @param {WorkerSession} s */
export function stopSession(s) {
  s.aborted = true;
  s.scoring = false;
  return Promise.resolve();
}

/** @param {WorkerSession} s @returns {boolean} */
export function isSessionScoring(s) {
  return s.scoring;
}

/** @param {number} count */
export function ensurePool(count) {
  while (pool.length < count) pool.push(createSession());
}

/** @returns {WorkerSession|null} */
export function getIdleSession() {
  return pool.find((s) => !s.scoring) || null;
}

/** @returns {WorkerSession[]} */
export function getAllSessions() {
  return pool;
}

/** Stop all and clear pool. */
export async function destroyPool() {
  for (const s of pool) s.aborted = true;
  pool = [];
  if (genotypedTables) {
    await dropGenotypedDNA(genotypedTables);
    genotypedTables = null;
  }
  await dropLiftover();
  if (dbReady) {
    await closeDuckDB();
    dbReady = false;
  }
}
