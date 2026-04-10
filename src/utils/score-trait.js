/**
 * Score a single trait — genotyped or unified (imputed).
 * @module utils/score-trait
 */

import { matchGenotyped } from '/packages/core/src/duckdb/genotyped-source.js';
import { scoreUnified, buildScoredMaps } from '/packages/core/src/duckdb/unified-source.js';
import { scoreFromMatches, finalize } from '/packages/core/src/scorer.js';

/** @param {string} url @param {object} t @param {Map} posMap */
export async function scoreGenotypedTrait(url, t, posMap) {
  if (!posMap) throw new Error('DNA not loaded');
  const scored = await scoreFromMatches(matchGenotyped(url, posMap), new Map());
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

/** @param {string} url @param {object} t @param {Function} [onProgress] */
export async function scoreUnifiedTrait(url, t, onProgress) {
  const onChr = onProgress
    ? (done, total, matched) =>
        onProgress({ traitName: t.name, chrDone: done, chrTotal: total, variantsSoFar: matched })
    : undefined;
  const { pgsAggregates, chrCoverage } = await scoreUnified(url, onChr);
  return finalize(
    buildScoredMaps(pgsAggregates, chrCoverage),
    {},
    {
      traitType: t.trait_type,
      phenotypeMean: t.phenotype_mean,
      phenotypeSd: t.phenotype_sd,
    },
  );
}

/** @param {File} file @returns {Promise<Array<{name: string, offset: number, size: number}>>} */
export async function parseTar(file) {
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
