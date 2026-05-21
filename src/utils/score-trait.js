/**
 * Score a single trait from .asili chr packs via unified SQL JOIN.
 * Both genotyped and imputed DNA use the same path — genotyped data
 * is loaded into DuckDB tables by loadGenotypedDNA, imputed data is
 * registered as parquet buffers. scoreUnifiedChrPacks handles both.
 * @module utils/score-trait
 */

import { registerBuffer, dropFile } from '/packages/core/src/duckdb/adapter.js';
import { scoreUnifiedChrPacks, getChrFiles } from '/packages/core/src/duckdb/unified-source.js';
import { buildScoredMaps } from '/packages/core/src/duckdb/scored-maps.js';
import { fetchTopVariants } from '/packages/core/src/duckdb/top-variants.js';
import { finalize } from '/packages/core/src/scorer.js';
import { loadManifest } from '#utils/manifest.js';
import { get as storageGet } from '#utils/storage.js';
import { DATA_BASE } from '#utils/data-url.js';
import { trackTransfer } from '#utils/transfer-tracker.js';
import { getScoringSettings } from '#utils/queue-settings.js';
import { S, notify } from '#utils/queue-state.js';

/** @type {Record<string, object>|null} */
let normCache = null;

/** Fetch PGS normalization params + R² from manifest metadata. Cached. */
export async function getNormParams() {
  if (normCache) return normCache;
  normCache = {};
  try {
    const resp = await fetch(`${DATA_BASE}/pgs_norm_params.json?v=${Date.now()}`);
    if (!resp.ok) throw new Error(`${resp.status}`);
    const raw = await resp.json();
    for (const [id, v] of Object.entries(raw)) {
      normCache[id] = { norm_mean: v.m, norm_sd: v.s, variants_number: v.n };
      if (v.d) normCache[id].distribution = v.d;
      if (v.ancestry) normCache[id].ancestry = v.ancestry;
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
  // Apply ancestry-specific norms if user has selected one
  const ancestry = storageGet('ancestry');
  if (ancestry) {
    for (const [id, entry] of Object.entries(normCache)) {
      const pop = entry.ancestry?.[ancestry];
      if (pop) {
        entry.norm_mean = pop.m;
        entry.norm_sd = pop.s;
      }
    }
  }
  return normCache;
}

/**
 * Parse tar headers by hopping through the archive.
 * Fetches only 512-byte headers, skipping file data.
 * @param {string} url
 * @returns {Promise<Array<{name: string, offset: number, size: number}>>}
 */
async function fetchTarIndex(url) {
  // First, get the manifest (always first entry) to know total structure
  const firstResp = await fetch(url, { headers: { Range: 'bytes=0-511' } });
  if (firstResp.status !== 206) return null;
  
  const firstHeader = await firstResp.arrayBuffer();
  const dec = new TextDecoder();
  const bytes = new Uint8Array(firstHeader);
  const manifestSize = parseInt(dec.decode(bytes.subarray(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
  
  // Now we know where the first file after manifest starts
  // Walk through headers by computing next header position
  const entries = [];
  let off = 0;
  
  // We need to hop: read 512-byte header, skip data, repeat
  // Start with manifest
  off = 512 + Math.ceil(manifestSize / 512) * 512; // skip manifest data
  
  while (true) {
    const hdrResp = await fetch(url, { headers: { Range: `bytes=${off}-${off + 511}` } });
    if (hdrResp.status !== 206) break;
    const hdrBuf = await hdrResp.arrayBuffer();
    const hdr = new Uint8Array(hdrBuf);
    const name = dec.decode(hdr.subarray(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const size = parseInt(dec.decode(hdr.subarray(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
    entries.push({ name, offset: off + 512, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  
  return entries;
}

/**
 * Fetch .asili tar via per-chromosome Range requests.
 * @param {string} url @param {string} traitId
 * @returns {Promise<{chrMap: Map<string, string>, cleanup: Function, bytes: number, fetchMs: number}>}
 */
async function loadTraitPack(url, traitId) {
  const t0 = performance.now();

  // Try Range-based loading
  const entries = await fetchTarIndex(url);
  
  if (!entries) {
    // Fallback: no Range support
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    return loadTraitPackFull(url, traitId, resp, t0);
  }

  console.log(`[pack] ${traitId}: ${entries.length} chr parquets indexed via Range`);

  const chrEntries = entries.filter(e => e.name.endsWith('.parquet'));
  const chrMap = new Map();
  const names = [];
  const prefix = `t_${traitId}_`;
  let totalBytes = 0;

  // Fetch and register each chromosome parquet via Range request
  const { bandwidthLimit } = await getScoringSettings();
  const limitBytesPerSec = bandwidthLimit > 0 ? (bandwidthLimit * 1_000_000) / 8 : 0;

  for (let i = 0; i < chrEntries.length; i++) {
    const e = chrEntries[i];
    const chrNum = e.name.match(/chr(\d+)/)?.[1] || e.name.replace(/[^0-9]/g, '');
    const rangeEnd = e.offset + e.size - 1;
    console.log(`[pack] ${traitId} chr${chrNum}: ${(e.size / 1024).toFixed(0)}KB`);

    // Update progress: downloading chr N of total
    S.currentChrDone = i;
    S.currentChrTotal = chrEntries.length;
    S.subProgress = i / chrEntries.length;
    notify();

    const chrT0 = performance.now();
    const chrResp = await fetch(url, {
      headers: { Range: `bytes=${e.offset}-${rangeEnd}` },
    });

    let chrBuf;
    if (chrResp.body) {
      const reader = chrResp.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        trackTransfer(value.byteLength);
      }
      const combined = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      chrBuf = combined.buffer;
    } else {
      chrBuf = await chrResp.arrayBuffer();
      trackTransfer(chrBuf.byteLength);
    }

    // Per-chromosome throttle
    if (limitBytesPerSec > 0) {
      const chrFetchMs = performance.now() - chrT0;
      const chrMinMs = (chrBuf.byteLength / limitBytesPerSec) * 1000;
      const chrSleepMs = chrMinMs - chrFetchMs;
      if (chrSleepMs > 50) {
        await new Promise((r) => setTimeout(r, chrSleepMs));
      }
    }

    totalBytes += chrBuf.byteLength;
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, chrBuf);
    chrMap.set(chrNum, regName);
    names.push(regName);
  }

  const cleanup = async () => {
    for (const n of names) await dropFile(n);
    await new Promise((r) => setTimeout(r, 10));
  };
  const fetchMs = performance.now() - t0;
  console.log(`[pack] ${traitId}: ${(totalBytes / 1e6).toFixed(1)}MB in ${(fetchMs / 1000).toFixed(1)}s (${chrEntries.length} chr)`);
  return { chrMap, cleanup, bytes: totalBytes, fetchMs };
}

/**
 * Fallback: download entire .asili when Range requests aren't supported.
 */
async function loadTraitPackFull(url, traitId, resp, t0) {
  let tarBuf;
  if (resp.body) {
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      trackTransfer(value.byteLength);
    }
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    tarBuf = combined.buffer;
  } else {
    tarBuf = await resp.arrayBuffer();
    trackTransfer(tarBuf.byteLength);
  }

  const bytes = tarBuf.byteLength;
  const fetchMs = performance.now() - t0;
  const entries = parseTarBuffer(tarBuf);
  const chrMap = new Map();
  const names = [];
  const prefix = `t_${traitId}_`;
  for (const e of entries) {
    if (!e.name.endsWith('.parquet') || e.size < 100) continue;
    const chrNum = e.name.match(/chr(\d+)/)?.[1] || e.name.replace(/[^0-9]/g, '');
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, tarBuf.slice(e.offset, e.offset + e.size));
    chrMap.set(chrNum, regName);
    names.push(regName);
  }
  const cleanup = async () => {
    for (const n of names) await dropFile(n);
    await new Promise((r) => setTimeout(r, 10));
  };
  return { chrMap, cleanup, bytes, fetchMs };
}

/** @param {string} url @param {object} t @param {Function} [onProgress] */
export async function scoreUnifiedTrait(url, t, onProgress) {
  const { chrMap, cleanup, bytes, fetchMs } = await loadTraitPack(url, t.trait_id);
  return await scoreChrPacks(chrMap, cleanup, t, onProgress);
}

/**
 *
 */
async function scoreChrPacks(chrMap, cleanup, t, onProgress) {
  const onChr = onProgress
    ? (done, total, matched) =>
        onProgress({ traitName: t.name, chrDone: done, chrTotal: total, variantsSoFar: matched })
    : undefined;
  try {
    const { pgsAggregates, chrCoverage, chrTotals } = await scoreUnifiedChrPacks(chrMap, onChr);
    const normParams = await getNormParams();
    const result = finalize(buildScoredMaps(pgsAggregates, chrCoverage, chrTotals), normParams, {
      traitType: t.trait_type,
      phenotypeMean: t.phenotype_mean ?? null,
      phenotypeSd: t.phenotype_sd ?? null,
    });
    if (result.bestPGS) {
      try {
        const tv = await fetchTopVariants(getChrFiles(), chrMap, result.bestPGS);
        if (result.pgsDetails[result.bestPGS]) {
          result.pgsDetails[result.bestPGS].topVariants = tv;
        }
      } catch (e) {
        console.warn('topVariants:', e.message);
      }
    }
    return result;
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
