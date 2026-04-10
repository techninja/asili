/**
 * Score all pending traits for one individual via the worker pool.
 * @module utils/score-individual
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { getTraitList } from '#utils/manifest.js';
import { getIdleSession, initSession, scoreAll } from './worker-pool.js';
import { S, notifyNow, markDone, markError, markAllError } from './queue-state.js';
import { loadIndividualDNA } from './queue-loader.js';

/** @param {string} individualId */
export async function scoreIndividual(individualId) {
  const session = getIdleSession();
  if (!session) return;

  S.currentScoringId = individualId;
  S.currentTraitName = '';
  S.currentChrDone = 0;
  S.currentChrTotal = 0;
  notifyNow();

  try {
    if (!session.ready) {
      S.currentTraitName = 'Initializing DuckDB…';
      notifyNow();
      await initSession(session);
    }
    if (session.loadedDnaId !== individualId) {
      S.currentTraitName = 'Loading DNA…';
      notifyNow();
      await loadIndividualDNA(session, individualId);
      session.loadedDnaId = individualId;
    }
  } catch (err) {
    console.error(`Queue: failed to init/load for ${individualId}`, err.message);
    markAllError(individualId, err.message);
    session.loadedDnaId = '';
    return;
  }

  const pendingSet = S.pendingByIndividual.get(individualId);
  if (!pendingSet || pendingSet.size === 0) return;

  const allTraits = await getTraitList();
  const traitsToScore = allTraits.filter((t) => pendingSet.has(t.trait_id));
  if (traitsToScore.length === 0) return;

  if (!S.startMs) S.startMs = Date.now();

  try {
    await scoreAll(session, traitsToScore, '/data', {
      onProgress: ({ traitName, chrDone, chrTotal, variantsSoFar }) => {
        S.currentTraitName = traitName;
        S.currentChrDone = chrDone || 0;
        S.currentChrTotal = chrTotal || 0;
        if (variantsSoFar) S.liveVariants = variantsSoFar;
      },
      onTraitScored: async ({ traitId, result }) => {
        await idb.put('results', `${individualId}:${traitId}`, {
          ...result,
          traitId,
          calculatedAt: new Date().toISOString(),
        });
        markDone(individualId, traitId, result.totalMatches || 0);
      },
      onTraitError: ({ traitId }) => {
        markError(individualId, traitId);
      },
    });
  } catch (err) {
    if (!S.paused && !S.needsReprioritize) {
      console.error(`Queue: scoring batch error for ${individualId}`, err.message);
    }
  }

  if (S.needsReprioritize) {
    S.needsReprioritize = false;
    session.loadedDnaId = '';
  }
  S.currentScoringId = '';
  S.currentTraitName = '';
  S.currentChrDone = 0;
  S.currentChrTotal = 0;
}
