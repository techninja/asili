/**
 * Scoring controller — thin wrapper around the global scoring queue.
 * Bridges queue state to the beta-view host properties.
 * @module pages/beta/scoring-controller
 */

import * as queue from '#utils/scoring-queue.js';
import { get } from '#utils/storage.js';
import { loadResults } from './results-store.js';
import {
  getPendingImputedFile,
  getPendingImputedHandle,
  clearPendingImputedFile,
} from './beta-sections.js';
import { storeHandle, restoreAll } from '#utils/file-handle.js';

// Re-export action handlers from split module
export {
  handlePause,
  handleResume,
  handleResumePermission,
  getQueueState,
} from './scoring-actions.js';

/** @type {Function|null} */
let unsubscribe = null;

/**
 * Ensure the host is subscribed to queue state updates.
 * @param {object} host
 */
function ensureSubscribed(host) {
  if (unsubscribe) return;
  unsubscribe = queue.subscribe((state) => syncHostState(host, state));
}

/** Initialize queue — scan IDB, subscribe, start scoring. @param {object} host */
export async function initQueue(host) {
  ensureSubscribed(host);

  const restored = await restoreAll();
  for (const [id, file] of restored) queue.registerImputedFile(id, file);

  if (host.activeId) queue.setActiveIndividual(host.activeId);

  await queue.scanAndQueue();

  const settings = await queue.getScoringSettings();
  const wasPaused = get('paused') === '1';
  if (settings.autoScore && !wasPaused) {
    await queue.start();
  }
}

/** Switch active individual — boost priority, reload results. */
export async function switchIndividual(host, individualId) {
  queue.setActiveIndividual(individualId);
  host.activeId = individualId;
  const count = await loadResults(individualId);
  host.resultCount = count;
  host._switchEpoch = Date.now();
}

/** New individual created — register file, rescan, start. */
export async function onNewIndividual(host, individualId) {
  ensureSubscribed(host);

  const iFile = getPendingImputedFile();
  if (iFile) {
    const handle = getPendingImputedHandle();
    clearPendingImputedFile();
    queue.registerImputedFile(individualId, iFile);
    if (handle) storeHandle(individualId, handle);
  }

  queue.setActiveIndividual(individualId);
  await queue.scanAndQueue();

  // Start queue if not already running
  const state = queue.getState();
  if (!state.running && state.pending > 0) {
    await queue.start();
  }
}

/** @type {ReturnType<typeof setTimeout>|null} */ let loadTimer = null;

/** @param {object} host @param {object} state */
function syncHostState(host, state) {
  host.scoringStatus = state.paused
    ? 'paused'
    : state.running
      ? 'scoring'
      : state.pending === 0 && state.total > 0
        ? 'done'
        : state.pending > 0 && !state.running
          ? 'blocked'
          : '';

  host.scoringTrait = state.currentTraitName;
  host.scoringChrDone = state.currentChrDone;
  host.scoringChrTotal = state.currentChrTotal;
  host.scoringCurrent = state.done + state.errors;
  host.scoringTotal = state.total;
  host.scoringIndividualCount = state.individualCount;
  host.scoringCurrentId = state.currentScoringId;
  host._scoringRate = state.rate || 0;
  host._scoringEta = state.etaSeconds || 0;

  // Auto-dismiss scoring screen when done
  if (host.scoringScreen && !state.running && !state.paused) {
    host.scoringScreen = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  if (state.activeIndividualId === host.activeId) {
    const ind = state.byIndividual[host.activeId];
    if (ind && ind.done !== host.resultCount) {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        loadResults(host.activeId).then((c) => {
          host.resultCount = c;
        });
      }, 500);
    }
  }
}
