/**
 * Score a single trait from .asili chr packs via unified SQL JOIN.
 * Fetching logic lives in score-fetch.js.
 * @module utils/score-trait
 */

import { scoreUnifiedChrPacks, getChrFiles } from '/packages/core/src/duckdb/unified-source.js';
import { buildScoredMaps } from '/packages/core/src/duckdb/scored-maps.js';
import { fetchTopVariants } from '/packages/core/src/duckdb/top-variants.js';
import { finalize } from '/packages/core/src/scorer.js';
import { loadManifest } from '#utils/manifest.js';
import { get as storageGet } from '#utils/storage.js';
import { DATA_BASE } from '#utils/data-url.js';
import { loadTraitPack } from '#utils/score-fetch.js';

export { parseTar } from '#utils/score-fetch.js';

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
  try {
    const manifest = await loadManifest();
    for (const [id, meta] of Object.entries(manifest.pgs || {})) {
      if (!normCache[id]) normCache[id] = {};
      if (meta.r2) normCache[id].performance_weight = meta.r2;
    }
  } catch { /* manifest may not have pgs */ }
  const ancestry = storageGet('ancestry');
  if (ancestry) {
    for (const [_id, entry] of Object.entries(normCache)) {
      const pop = entry.ancestry?.[ancestry];
      if (pop) { entry.norm_mean = pop.m; entry.norm_sd = pop.s; }
    }
  }
  return normCache;
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
      } catch (e) { console.warn('topVariants:', e.message); }
    }
    return result;
  } finally {
    await cleanup();
  }
}
