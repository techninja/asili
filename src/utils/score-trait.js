/**
 * Score a single trait — genotyped or unified (imputed) with .asili chr packs.
 * @module utils/score-trait
 */

import { registerBuffer, dropFile } from '/packages/core/src/duckdb/adapter.js';
import { matchGenotyped } from '/packages/core/src/duckdb/genotyped-source.js';
import { scoreUnifiedChrPacks, buildScoredMaps } from '/packages/core/src/duckdb/unified-source.js';
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

/**
 * Score a unified trait from an .asili tar URL.
 * Fetches tar, registers per-chr parquets, scores chr-to-chr, cleans up.
 * @param {string} url @param {object} t @param {Function} [onProgress]
 */
export async function scoreUnifiedTrait(url, t, onProgress) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const tarBuf = await resp.arrayBuffer();
  const entries = parseTarBuffer(tarBuf);
  const chrMap = new Map();
  const regNames = [];
  const prefix = `t_${t.trait_id}_`;
  for (const e of entries) {
    if (!e.name.endsWith('.parquet')) continue;
    if (e.size < 100) continue; // skip empty/tiny chr parquets
    const chrNum = e.name.replace(/[^0-9]/g, '');
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, tarBuf.slice(e.offset, e.offset + e.size));
    chrMap.set(chrNum, regName);
    regNames.push(regName);
  }
  const onChr = onProgress
    ? (done, total, matched) =>
        onProgress({ traitName: t.name, chrDone: done, chrTotal: total, variantsSoFar: matched })
    : undefined;
  try {
    const { pgsAggregates, chrCoverage } = await scoreUnifiedChrPacks(chrMap, onChr);
    return finalize(
      buildScoredMaps(pgsAggregates, chrCoverage),
      {},
      {
        traitType: t.trait_type,
        phenotypeMean: t.phenotype_mean,
        phenotypeSd: t.phenotype_sd,
      },
    );
  } finally {
    for (const name of regNames) await dropFile(name);
    await new Promise((r) => setTimeout(r, 10));
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
