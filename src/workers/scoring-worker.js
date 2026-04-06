/**
 * Scoring Web Worker — runs DuckDB WASM scoring off the main thread.
 * Supports abort between traits via scoring run ID.
 * @module workers/scoring-worker
 */

import { initDuckDB } from '/packages/core/src/duckdb/adapter.js';
import { buildPosMap, matchGenotyped } from '/packages/core/src/duckdb/genotyped-source.js';
import { scoreFromMatches, finalize } from '/packages/core/src/scorer.js';

/** @type {Map<string, object>|null} */
let posMap = null;
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
      posMap = buildPosMap(e.data.variants);
      self.postMessage({ type: 'dnaLoaded', id, variantCount: posMap.size });
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

/** @param {object} msg */
async function handleScoreAll(msg) {
  const { traits, dataPath, id } = msg;
  if (!posMap) throw new Error('DNA not loaded');

  activeScoringId = id;

  for (let i = 0; i < traits.length; i++) {
    if (activeScoringId !== id) {
      self.postMessage({ type: 'aborted', id });
      return;
    }

    const t = traits[i];
    self.postMessage({
      type: 'progress',
      id,
      current: i,
      total: traits.length,
      traitName: t.name,
    });

    try {
      const traitUrl = `${dataPath}/${t.file_path}`;
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

  if (activeScoringId === id) {
    self.postMessage({ type: 'allDone', id });
  }
}
