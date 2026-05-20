/**
 * Queue state — shared mutable state, pub/sub, and mutation helpers.
 * Snapshot builder lives in queue-snapshot.js.
 * @module utils/queue-state
 */

import { getState } from './queue-snapshot.js';

/** @type {Set<Function>} */ const listeners = new Set();
/** @type {ReturnType<typeof setTimeout>|null} */ let debounceTimer = null;

/** Internal state object — shared across queue modules. */
export const S = {
  /** @type {Map<string, Set<string>>} */ pendingByIndividual: new Map(),
  /** @type {Map<string, Set<string>>} */ doneByIndividual: new Map(),
  /** @type {Map<string, Set<string>>} */ errorByIndividual: new Map(),
  /** @type {Map<string, boolean>} */ individualMeta: new Map(),
  /** @type {Map<string, File>} */ imputedFiles: new Map(),
  activeIndividualId: '',
  currentScoringId: '',
  currentTraitName: '',
  currentChrDone: 0,
  currentChrTotal: 0,
  /** Sub-process progress (0-1): DNA loading, chromosome within trait, etc. */
  subProgress: 0,
  /** @type {Record<string, number>} Per-individual bytes downloaded */
  transferBytes: {},
  /** Smoothed transfer rate in bytes/sec */
  transferRate: 0,
  paused: false,
  running: false,
  startMs: 0,
  totalVariantsScored: 0,
  traitsCompleted: 0,
  liveVariants: 0,
  needsReprioritize: false,
  lastError: '',
  /** @type {Set<string>} Individuals currently being scored by a worker */
  activeScoringIds: new Set(),
};

// Re-export for consumers
export { getState };

/** Subscribe to state changes. Returns unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Debounced notify — coalesces rapid markDone/markError calls. */
export function notify() {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    for (const fn of listeners) fn(getState());
  }, 150);
}

/** Immediate notify for critical transitions (pause/resume/reset). */
export function notifyNow() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  for (const fn of listeners) fn(getState());
}

/** Ensure a Set exists in a Map for the given key, return it. */
function ensure(map, key) {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
}

/** @param {string} id @param {string} tid @param {number} matches */
export function markDone(id, tid, matches) {
  S.pendingByIndividual.get(id)?.delete(tid);
  ensure(S.doneByIndividual, id).add(tid);
  S.totalVariantsScored += matches;
  S.liveVariants = 0;
  S.subProgress = 0;
  S.traitsCompleted++;
  notify();
}

/** @param {string} id @param {string} tid */
export function markError(id, tid) {
  S.pendingByIndividual.get(id)?.delete(tid);
  ensure(S.errorByIndividual, id).add(tid);
  S.traitsCompleted++;
  notify();
}

/** @param {string} id @param {string} reason */
export function markAllError(id, reason) {
  const pending = S.pendingByIndividual.get(id);
  if (!pending) return;
  const errors = ensure(S.errorByIndividual, id);
  for (const tid of pending) errors.add(tid);
  pending.clear();
  S.lastError = reason || 'Unknown error';
  console.warn(`Queue: ${errors.size} traits errored for ${id}: ${reason}`);
  notify();
}

/** @param {string} id @returns {boolean} */
export function canScoreIndividual(id) {
  return !(S.individualMeta.get(id) && !S.imputedFiles.has(id));
}

/** @returns {string|null} Next individual to score (active first, then largest pending). */
export function pickNextIndividual() {
  const aid = S.activeIndividualId;
  if (aid && !S.activeScoringIds.has(aid)) {
    const p = S.pendingByIndividual.get(aid);
    if (p?.size > 0 && canScoreIndividual(aid)) return aid;
  }
  let best = /** @type {string|null} */ (null);
  let bestCount = 0;
  for (const [id, p] of S.pendingByIndividual) {
    if (S.activeScoringIds.has(id)) continue;
    if (p.size > bestCount && canScoreIndividual(id)) {
      bestCount = p.size;
      best = id;
    }
  }
  if (!best) {
    for (const [id, p] of S.pendingByIndividual) {
      if (p.size > 0 && !canScoreIndividual(id)) console.warn(`[queue] ${id}: imputed, no file`);
    }
  }
  return best;
}
