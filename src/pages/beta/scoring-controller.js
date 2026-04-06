/**
 * Scoring controller — manages DuckDB WASM scoring for the active individual.
 * @module pages/beta/scoring-controller
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { initScoring, loadDNA, scoreAll, stopScoring, isScoring } from '#utils/scoring.js';
import { getTraitList } from '#utils/manifest.js';
import { setResult } from './results-store.js';

/** @type {string} */
let activeScoringId = '';

/**
 * Start scoring for an individual. Attaches progress to the host.
 * @param {object} host
 * @param {string} individualId
 */
export async function startScoring(host, individualId) {
  if (isScoring()) await stopScoring();
  const stored = await idb.get('variants', individualId);
  if (!stored?.variants) return;

  activeScoringId = individualId;
  host.scoringStatus = 'init';
  try {
    await initScoring();
    await loadDNA(stored.variants);
    if (activeScoringId !== individualId) return;
    host.scoringStatus = 'scoring';
    const traits = await getTraitList();
    host.scoringTotal = traits.length;
    await scoreAll(traits, '/data', {
      onProgress: ({ current, total, traitName }) => {
        host.scoringCurrent = current;
        host.scoringTotal = total;
        host.scoringTrait = traitName;
      },
      onTraitScored: async ({ traitId, result }) => {
        await setResult(traitId, result);
        host.resultCount++;
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
