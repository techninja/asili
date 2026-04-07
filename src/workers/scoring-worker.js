/**
 * Scoring Web Worker — runs DuckDB WASM scoring off the main thread.
 * Supports genotyped (text) and imputed (.asili archive) DNA sources.
 * @module workers/scoring-worker
 */

import { initDuckDB, registerFileHandle } from '/packages/core/src/duckdb/adapter.js';
import { buildPosMap, matchGenotyped } from '/packages/core/src/duckdb/genotyped-source.js';
import {
  loadUnifiedDNA,
  scoreUnified,
  resetUnifiedDNA,
  buildScoredMaps,
} from '/packages/core/src/duckdb/unified-source.js';
import { scoreFromMatches, finalize } from '/packages/core/src/scorer.js';

/** @type {Map<string, object>|null} */
let posMap = null;
/** @type {boolean} */
let unifiedMode = false;
/** @type {number} */
let activeScoringId = 0;

self.onmessage = async (e) => {
  const { type, id } = e.data;
  try {
    if (type === 'init') {
      const { origin } = e.data;
      await initDuckDB(origin ? `${origin}/deps/duckdb` : '/deps/duckdb');
      self.postMessage({ type: 'ready', id });
    } else if (type === 'loadDNA') {
      await handleLoadDNA(e.data, id);
    } else if (type === 'scoreAll') {
      await handleScoreAll(e.data);
    } else if (type === 'abort') {
      activeScoringId = 0;
      self.postMessage({ type: 'aborted', id });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err.message });
  }
};

/** @param {object} data @param {number} id */
async function handleLoadDNA(data, id) {
  if (data.imputedFile) {
    resetUnifiedDNA();
    const entries = await parseTar(data.imputedFile);
    const chrNames = [];
    for (const entry of entries) {
      if (!entry.name.endsWith('.parquet')) continue;
      const slice = data.imputedFile.slice(entry.offset, entry.offset + entry.size);
      const sliceFile = new File([slice], entry.name, { type: 'application/octet-stream' });
      await registerFileHandle(entry.name, sliceFile);
      chrNames.push(entry.name);
    }
    await loadUnifiedDNA(chrNames);
    unifiedMode = true;
    posMap = null;
    self.postMessage({ type: 'dnaLoaded', id, variantCount: 0, unified: true });
  } else {
    posMap = buildPosMap(data.variants);
    unifiedMode = false;
    self.postMessage({ type: 'dnaLoaded', id, variantCount: posMap.size });
  }
}

/** @param {object} msg */
async function handleScoreAll(msg) {
  const { traits, dataPath, id } = msg;
  activeScoringId = id;

  for (let i = 0; i < traits.length; i++) {
    if (activeScoringId !== id) {
      self.postMessage({ type: 'aborted', id });
      return;
    }
    const t = traits[i];
    const prog = (cd = 0, ct = 0) =>
      self.postMessage({
        type: 'progress',
        id,
        current: i,
        total: traits.length,
        traitName: t.name,
        chrDone: cd,
        chrTotal: ct,
      });
    prog();
    try {
      const traitUrl = `${dataPath}/${t.file_path}`;
      const result = unifiedMode
        ? await scoreUnifiedTrait(traitUrl, t, prog)
        : await scoreGenotypedTrait(traitUrl, t);
      result.calculatedAt = new Date().toISOString();
      self.postMessage({ type: 'scored', id, traitId: t.trait_id, result });
    } catch (err) {
      self.postMessage({ type: 'traitError', id, traitId: t.trait_id, error: err.message });
    }
  }
  if (activeScoringId === id) self.postMessage({ type: 'allDone', id });
}

/** @param {string} traitUrl @param {object} t */
async function scoreGenotypedTrait(traitUrl, t) {
  if (!posMap) throw new Error('DNA not loaded');
  const iterator = matchGenotyped(traitUrl, posMap);
  const scored = await scoreFromMatches(iterator, new Map());
  return finalize(
    scored,
    {},
    {
      traitType: t.trait_type,
      phenotypeMean: t.phenotype_mean,
      phenotypeSd: t.phenotype_sd,
    },
  );
}

/** @param {string} traitUrl @param {object} t @param {Function} [onChr] */
async function scoreUnifiedTrait(traitUrl, t, onChr) {
  const { pgsAggregates, chrCoverage } = await scoreUnified(traitUrl, onChr);
  const scored = buildScoredMaps(pgsAggregates, chrCoverage);
  return finalize(
    scored,
    {},
    {
      traitType: t.trait_type,
      phenotypeMean: t.phenotype_mean,
      phenotypeSd: t.phenotype_sd,
    },
  );
}

/** @param {File} file @returns {Promise<Array<{name: string, offset: number, size: number}>>} */
async function parseTar(file) {
  const dec = new TextDecoder();
  const entries = [];
  let off = 0;
  while (off + 512 <= file.size) {
    const h = new Uint8Array(await file.slice(off, off + 512).arrayBuffer());
    const name = dec.decode(h.slice(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const size = parseInt(dec.decode(h.slice(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
    entries.push({ name, offset: off + 512, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
