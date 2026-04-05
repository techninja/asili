/**
 * Scoring Web Worker — runs DuckDB WASM scoring off the main thread.
 * Messages: { type: 'init' | 'score', ... }
 * @module workers/scoring-worker
 */

import { initDuckDB } from '/packages/core/src/duckdb/adapter.js';
import { buildPosMap, matchGenotyped } from '/packages/core/src/duckdb/genotyped-source.js';
import { scoreFromMatches, finalize } from '/packages/core/src/scorer.js';

/** @type {Map<string, object>|null} */
let posMap = null;

self.onmessage = async (e) => {
  const { type, id } = e.data;
  try {
    if (type === 'init') {
      const { origin } = e.data;
      await initDuckDB(origin ? `${origin}/deps/duckdb` : '/deps/duckdb');
      self.postMessage({ type: 'ready', id });
    } else if (type === 'loadDNA') {
      const { variants } = e.data;
      posMap = buildPosMap(variants);
      self.postMessage({ type: 'dnaLoaded', id, variantCount: posMap.size });
    } else if (type === 'score') {
      await handleScore(e.data);
    } else if (type === 'scoreAll') {
      await handleScoreAll(e.data);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, error: err.message });
  }
};

/**
 * Score a single trait.
 * @param {object} msg
 */
async function handleScore(msg) {
  const { traitUrl, traitId, normParams, opts, id } = msg;
  if (!posMap) throw new Error('DNA not loaded');

  const iterator = matchGenotyped(traitUrl, posMap);
  const scored = await scoreFromMatches(iterator, new Map());
  const result = finalize(scored, normParams || {}, opts || {});
  result.calculatedAt = new Date().toISOString();

  self.postMessage({ type: 'scored', id, traitId, result });
}

/**
 * Score all traits sequentially.
 * @param {object} msg
 */
async function handleScoreAll(msg) {
  const { traits, dataPath, id } = msg;
  if (!posMap) throw new Error('DNA not loaded');

  for (let i = 0; i < traits.length; i++) {
    const t = traits[i];
    const traitUrl = `${dataPath}/${t.file_path}`;
    self.postMessage({
      type: 'progress',
      id,
      current: i,
      total: traits.length,
      traitName: t.name,
    });

    try {
      const iterator = matchGenotyped(traitUrl, posMap);
      const scored = await scoreFromMatches(iterator, new Map());
      const result = finalize(
        scored,
        {},
        {
          traitType: t.trait_type,
          phenotypeMean: t.phenotype_mean,
          phenotypeSd: t.phenotype_sd,
        },
      );
      result.calculatedAt = new Date().toISOString();
      self.postMessage({ type: 'scored', id, traitId: t.trait_id, result });
    } catch (err) {
      self.postMessage({ type: 'traitError', id, traitId: t.trait_id, error: err.message });
    }
  }

  self.postMessage({ type: 'allDone', id });
}
