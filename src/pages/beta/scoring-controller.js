/**
 * Scoring controller — manages DuckDB WASM scoring for the active individual.
 * Supports genotyped (text variants) and imputed (.asili archive) sources.
 * @module pages/beta/scoring-controller
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { initScoring, loadDNA, scoreAll, stopScoring, isScoring } from '#utils/scoring.js';
import { getTraitList } from '#utils/manifest.js';
import { setResult } from './results-store.js';
import { getPendingImputedFile, clearPendingImputedFile } from './beta-sections.js';

/** @type {string} */
let activeScoringId = '';
/** @type {number} */
let scoringStartMs = 0;
/** @type {number} */
let scoringVariantTotal = 0;

/** @returns {number} */
export function getScoringStartTime() {
  return scoringStartMs;
}
/** @returns {number} */
export function getScoringVariants() {
  return scoringVariantTotal;
}

/**
 * Start scoring for an individual. Detects imputed File vs genotyped.
 * @param {object} host
 * @param {string} individualId
 */
export async function startScoring(host, individualId) {
  if (isScoring()) await stopScoring();

  const iFile = getPendingImputedFile();
  if (iFile) {
    clearPendingImputedFile();
    await runScoring(host, individualId, null, iFile);
    return;
  }

  const stored = await idb.get('variants', individualId);
  if (!stored?.variants) return;
  await runScoring(host, individualId, stored.variants, null);
}

/**
 * @param {object} host
 * @param {string} individualId
 * @param {Array|null} variants
 * @param {File|null} imputedFile
 */
async function runScoring(host, individualId, variants, imputedFile) {
  activeScoringId = individualId;
  host.scoringStatus = 'init';
  try {
    await initScoring();
    await loadDNA(variants, imputedFile);
    if (activeScoringId !== individualId) return;
    host.scoringStatus = 'scoring';
    scoringStartMs = Date.now();
    scoringVariantTotal = 0;
    const traits = await getTraitList();
    host.scoringTotal = traits.length;
    await scoreAll(traits, '/data', {
      onProgress: ({ current, total, traitName, chrDone, chrTotal }) => {
        host.scoringCurrent = current;
        host.scoringTotal = total;
        host.scoringTrait = traitName;
        host.scoringChrDone = chrDone || 0;
        host.scoringChrTotal = chrTotal || 0;
      },
      onTraitScored: async ({ traitId, result }) => {
        await setResult(traitId, result);
        host.resultCount++;
        scoringVariantTotal += result.totalMatches || 0;
      },
    });
    host.scoringStatus = 'done';
  } catch {
    host.scoringStatus = 'error';
  }
}

/** @returns {{ isScoring: boolean }} */
export function scoringState() {
  return { isScoring: isScoring() };
}

/** @param {object} host */
export async function handleStopScoring(host) {
  await stopScoring();
  activeScoringId = '';
  host.scoringStatus = host.resultCount > 0 ? 'done' : '';
}
