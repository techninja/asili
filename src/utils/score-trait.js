/**
 * Score a single trait from .asili chr packs via unified SQL JOIN.
 * Both genotyped and imputed DNA use the same path — genotyped data
 * is loaded into DuckDB tables by loadGenotypedDNA, imputed data is
 * registered as parquet buffers. scoreUnifiedChrPacks handles both.
 * @module utils/score-trait
 */

import { registerBuffer, dropFile } from '/packages/core/src/duckdb/adapter.js';
import { scoreUnifiedChrPacks } from '/packages/core/src/duckdb/unified-source.js';
import { buildScoredMaps } from '/packages/core/src/duckdb/scored-maps.js';
import { finalize } from '/packages/core/src/scorer.js';
import { loadManifest } from '#utils/manifest.js';

/** @type {Record<string, object>|null} */
let normCache = null;

/** Fetch PGS normalization params + R² from manifest metadata. Cached. */
async function getNormParams() {
  if (normCache) return normCache;
  normCache = {};
  try {
    const resp = await fetch(`${window.location.origin}/data/pgs_norm_params.json`);
    if (!resp.ok) throw new Error(`${resp.status}`);
    const raw = await resp.json();
    for (const [id, v] of Object.entries(raw)) {
      normCache[id] = { norm_mean: v.m, norm_sd: v.s, variants_number: v.n };
    }
  } catch (e) {
    console.warn('No pgs_norm_params.json — using theoretical SD', e.message);
  }
  // Merge R² from manifest PGS metadata
  try {
    const manifest = await loadManifest();
    for (const [id, meta] of Object.entries(manifest.pgs || {})) {
      if (!normCache[id]) normCache[id] = {};
      if (meta.r2) normCache[id].performance_weight = meta.r2;
    }
  } catch {
    /* manifest may not have pgs */
  }
  return normCache;
}

/**
 * Fetch .asili tar, register chr parquets, return map + cleanup fn.
 * @param {string} url @param {string} traitId
 * @returns {Promise<{chrMap: Map<string, string>, cleanup: Function}>}
 */
async function loadTraitPack(url, traitId) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const tarBuf = await resp.arrayBuffer();
  const entries = parseTarBuffer(tarBuf);
  const chrMap = new Map();
  const names = [];
  const prefix = `t_${traitId}_`;
  for (const e of entries) {
    if (!e.name.endsWith('.parquet') || e.size < 100) continue;
    const chrNum = e.name.replace(/[^0-9]/g, '');
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, tarBuf.slice(e.offset, e.offset + e.size));
    chrMap.set(chrNum, regName);
    names.push(regName);
  }
  const cleanup = async () => {
    for (const n of names) await dropFile(n);
    await new Promise((r) => setTimeout(r, 10));
  };
  return { chrMap, cleanup };
}

/** @param {string} url @param {object} t @param {Function} [onProgress] */
export async function scoreUnifiedTrait(url, t, onProgress) {
  const { chrMap, cleanup } = await loadTraitPack(url, t.trait_id);
  const onChr = onProgress
    ? (done, total, matched) =>
        onProgress({ traitName: t.name, chrDone: done, chrTotal: total, variantsSoFar: matched })
    : undefined;
  try {
    const { pgsAggregates, chrCoverage, chrTotals } = await scoreUnifiedChrPacks(chrMap, onChr);
    const normParams = await getNormParams();
    return finalize(buildScoredMaps(pgsAggregates, chrCoverage, chrTotals), normParams, {
      traitType: t.trait_type,
      phenotypeMean: t.phenotype_mean,
      phenotypeSd: t.phenotype_sd,
    });
  } finally {
    await cleanup();
  }
}

/** @param {ArrayBuffer} buf */
function parseTarBuffer(buf) {
  const dec = new TextDecoder();
  const bytes = new Uint8Array(buf);
  const entries = [];
  let off = 0;
  while (off + 512 <= bytes.length) {
    const h = bytes.slice(off, off + 512);
    const name = dec.decode(h.slice(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const size = parseInt(dec.decode(h.slice(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
    entries.push({ name, offset: off + 512, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/** @param {File} file */
export async function parseTar(file) {
  const buf = await file.arrayBuffer();
  return parseTarBuffer(buf);
}
