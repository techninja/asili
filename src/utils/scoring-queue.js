/**
 * Global scoring queue — public API.
 * State lives in queue-state.js, execution in queue-runner.js.
 * @module utils/scoring-queue
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { getTraitList } from '#utils/manifest.js';
import { S, subscribe, getState, notifyNow, canScoreIndividual } from './queue-state.js';
import { acquire, release } from './wake-lock.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';

// Re-export for consumers
export { subscribe, getState };

/** Scan all individuals × traits, queue unscored combinations. */
export async function scanAndQueue() {
  await idb.openDB();
  const individuals = await idb.getAll('individuals');
  const traits = await getTraitList();
  const resultKeys = new Set(await idb.getAllKeys('results'));

  S.pendingByIndividual = new Map();
  S.doneByIndividual = new Map();
  S.errorByIndividual = new Map();
  S.individualMeta = new Map();

  for (const ind of individuals) {
    const pending = new Set(),
      done = new Set();
    S.individualMeta.set(ind.id, !!ind.hasImputed);
    for (const t of traits) {
      (resultKeys.has(`${ind.id}:${t.trait_id}`) ? done : pending).add(t.trait_id);
    }
    S.pendingByIndividual.set(ind.id, pending);
    S.doneByIndividual.set(ind.id, done);
    S.errorByIndividual.set(ind.id, new Set());
  }
}

/** @param {string} id */
export function setActiveIndividual(id) {
  if (id === S.activeIndividualId) return;
  S.activeIndividualId = id;
  if (S.running && S.currentScoringId && S.currentScoringId !== id) {
    const p = S.pendingByIndividual.get(id);
    if (p?.size > 0 && canScoreIndividual(id)) {
      S.needsReprioritize = true;
      import('./queue-runner.js').then((r) => r.abortForReprioritize());
    }
  }
}

/** @param {string} id @param {File} file */
export function registerImputedFile(id, file) {
  S.imputedFiles.set(id, file);
}

/** @returns {string[]} Imputed individual IDs needing file re-upload. */
export function getImputedNeedingReupload() {
  const ids = [];
  for (const [id, isImputed] of S.individualMeta) {
    if (isImputed && !S.imputedFiles.has(id) && (S.pendingByIndividual.get(id)?.size || 0) > 0) {
      ids.push(id);
    }
  }
  return ids;
}

/** Start processing the queue (non-blocking — runs in background). */
export async function start() {
  if (S.running) return;
  S.paused = false;
  S.running = true;
  notifyNow();
  acquire();
  startHeartbeat();
  const { processLoop } = await import('./queue-runner.js');
  processLoop();
}

/** Pause the queue. */
export async function pause() {
  S.paused = true;
  S.running = false;
  const { pauseRunner } = await import('./queue-runner.js');
  await pauseRunner();
  S.currentScoringId = '';
  S.currentTraitName = '';
  release();
  stopHeartbeat();
  notifyNow();
}

/** Resume after pause. */
export async function resume() {
  if (!S.paused) return;
  await start();
}

/** Stop scoring and clear queue state. */
export async function resetQueue() {
  release();
  stopHeartbeat();
  const { resetRunner } = await import('./queue-runner.js');
  await resetRunner();
  S.pendingByIndividual = new Map();
  S.doneByIndividual = new Map();
  S.errorByIndividual = new Map();
  S.individualMeta = new Map();
  S.imputedFiles.clear();
  Object.assign(S, {
    paused: false,
    running: false,
    currentScoringId: '',
    currentTraitName: '',
    startMs: 0,
    totalVariantsScored: 0,
    liveVariants: 0,
    traitsCompleted: 0,
    needsReprioritize: false,
    currentChrDone: 0,
    currentChrTotal: 0,
    activeIndividualId: '',
  });
  S.activeScoringIds.clear();
  notifyNow();
}

// Re-export settings
export { getScoringSettings, saveScoringSettings } from './queue-settings.js';
