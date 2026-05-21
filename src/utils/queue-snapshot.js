/**
 * Queue snapshot — rate from per-chromosome variant progress, EMA ETA.
 * @module utils/queue-snapshot
 */

import { S } from './queue-state.js';

/** @returns {number} */
function getCurrentRate() {
  // While scoring, recalculate from session totals (updates every tick)
  if (S.running && S._transferStartTs > 0 && S._transferSessionBytes > 0) {
    const elapsed = (Date.now() - S._transferStartTs) / 1000;
    return elapsed > 0 ? S._transferSessionBytes / elapsed : 0;
  }
  if (!S._transferLastTs || !S.transferRate) return 0;
  const age = Date.now() - S._transferLastTs;
  const STALE_MS = 30_000;
  if (age > STALE_MS) {
    const decay = Math.max(0, 1 - (age - STALE_MS) / STALE_MS);
    return S.transferRate * decay;
  }
  return S.transferRate;
}

/** @param {Map<string, Set<string>>} m */
function sum(m) {
  let n = 0;
  for (const s of m.values()) n += s.size;
  return n;
}

/** @type {number} */ let smoothedEta = 0;
/** @type {number} */ let lastCompleted = 0;
/** @type {number} */ let lastTs = 0;
/** @type {number} */ let lastLive = 0;
/** @type {number} */ let lastLiveTs = 0;
/** @type {number} */ let smoothedRate = 0;
const ETA_ALPHA = 0.15;
const RATE_ALPHA = 0.25;

/** Build a snapshot of the current queue state. */
export function getState() {
  const done = sum(S.doneByIndividual);
  const errors = sum(S.errorByIndividual);
  const pending = sum(S.pendingByIndividual);
  const now = Date.now();

  // EMA for seconds-per-trait (ETA)
  const completed = S.traitsCompleted;
  if (completed > lastCompleted && lastTs > 0) {
    const sample = (now - lastTs) / 1000 / (completed - lastCompleted);
    smoothedEta = smoothedEta > 0 ? smoothedEta * (1 - ETA_ALPHA) + sample * ETA_ALPHA : sample;
  }
  if (completed > lastCompleted) {
    lastCompleted = completed;
    lastTs = now;
  }

  // Rate from liveVariants + totalVariantsScored (updates per chromosome)
  const totalLive = S.totalVariantsScored + S.liveVariants;
  if (totalLive > lastLive && lastLiveTs > 0) {
    const dt = (now - lastLiveTs) / 1000;
    if (dt > 0.3) {
      const instant = (totalLive - lastLive) / dt;
      smoothedRate =
        smoothedRate > 0 ? smoothedRate * (1 - RATE_ALPHA) + instant * RATE_ALPHA : instant;
      lastLive = totalLive;
      lastLiveTs = now;
    }
  } else if (totalLive > lastLive) {
    lastLive = totalLive;
    lastLiveTs = now;
  }

  const byIndividual = {};
  for (const [id] of S.individualMeta) {
    const d = S.doneByIndividual.get(id)?.size || 0;
    const e = S.errorByIndividual.get(id)?.size || 0;
    const p = S.pendingByIndividual.get(id)?.size || 0;
    byIndividual[id] = { id, done: d, total: d + e + p, errors: e };
  }

  return {
    paused: S.paused,
    running: S.running,
    total: done + errors + pending,
    done,
    errors,
    pending,
    byIndividual,
    activeIndividualId: S.activeIndividualId,
    currentScoringId: S.currentScoringId,
    currentTraitName: S.currentTraitName,
    currentChrDone: S.currentChrDone,
    currentChrTotal: S.currentChrTotal,
    subProgress: S.subProgress,
    transferBytes: S.transferBytes,
    transferRate: getCurrentRate(),
    totalVariantsScored: totalLive,
    rate: smoothedRate,
    etaSeconds: smoothedEta > 0 ? Math.round(pending * smoothedEta) : 0,
    individualCount: S.individualMeta.size,
    lastError: S.lastError,
  };
}
