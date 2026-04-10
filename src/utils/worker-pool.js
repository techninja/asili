/**
 * Worker pool — manages DuckDB scoring sessions on the main thread.
 * DuckDB's AsyncDuckDB creates its own worker internally — no nesting.
 * @module utils/worker-pool
 * @typedef {object} WorkerSession
 * @property {boolean} ready
 * @property {boolean} dead
 * @property {boolean} scoring
 * @property {string} loadedDnaId
 * @property {boolean} aborted
 */

import { initDuckDB, registerBuffer, closeDuckDB } from '/packages/core/src/duckdb/adapter.js';
import { buildPosMap } from '/packages/core/src/duckdb/genotyped-source.js';
import { loadUnifiedDNA, resetUnifiedDNA } from '/packages/core/src/duckdb/unified-source.js';
import { scoreGenotypedTrait, scoreUnifiedTrait, parseTar } from './score-trait.js';

/** @type {boolean} */ let dbReady = false;
/** @type {Map<string, object>|null} */ let posMap = null;
/** @type {boolean} */ let unifiedMode = false;
/** @type {WorkerSession[]} */ let pool = [];

/** @returns {WorkerSession} */
function createSession() {
  return { ready: false, dead: false, scoring: false, loadedDnaId: '', aborted: false };
}

/** @param {WorkerSession} s */
export async function initSession(s) {
  if (!dbReady) {
    await initDuckDB(`${window.location.origin}/deps/duckdb`);
    dbReady = true;
  }
  s.ready = true;
  s.dead = false;
}

/** @param {WorkerSession} s @param {Array|null} variants @param {File} [file] */
export async function loadDNA(s, variants, file) {
  if (file) {
    resetUnifiedDNA();
    const entries = await parseTar(file);
    for (const e of entries) {
      if (!e.name.endsWith('.parquet')) continue;
      const buf = await file.slice(e.offset, e.offset + e.size).arrayBuffer();
      if (buf.byteLength !== e.size) {
        console.error(`[loadDNA] ${e.name}: expected ${e.size} bytes, got ${buf.byteLength}`);
      }
      await registerBuffer(e.name, buf);
    }
    await loadUnifiedDNA(entries.filter((e) => e.name.endsWith('.parquet')).map((e) => e.name));
    // Let DuckDB's worker fully process all registered buffers
    await new Promise((r) => setTimeout(r, 100));
    unifiedMode = true;
    posMap = null;
  } else {
    posMap = buildPosMap(variants);
    unifiedMode = false;
  }
}

/** @param {WorkerSession} s @param {Array} traits @param {string} path @param {object} cb */
export async function scoreAll(s, traits, path, cb = {}) {
  s.scoring = true;
  s.aborted = false;
  const base = `${window.location.origin}${path}`;
  try {
    for (let i = 0; i < traits.length; i++) {
      if (s.aborted) break;
      const t = traits[i];
      if (cb.onProgress) cb.onProgress({ traitName: t.name, chrDone: 0, chrTotal: 0 });
      // Yield to event loop so UI can update between traits
      await new Promise((r) => setTimeout(r, 0));
      try {
        const url = `${base}/${t.file_path}`;
        const result = unifiedMode
          ? await scoreUnifiedTrait(url, t, cb.onProgress)
          : await scoreGenotypedTrait(url, t, posMap);
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
  if (dbReady) {
    await closeDuckDB();
    dbReady = false;
  }
}
