/** @module utils/queue-runner */

import { getScoringSettings } from '#utils/queue-settings.js';
import {
  ensurePool,
  destroyPool,
  getAllSessions,
  stopSession,
  isSessionScoring,
} from './worker-pool.js';
import { S, notifyNow, pickNextIndividual } from './queue-state.js';
import { release } from './wake-lock.js';
import { stopHeartbeat } from './heartbeat.js';
import { scoreIndividual } from './score-individual.js';

/** Main processing loop — launches parallel workers per settings. */
export async function processLoop() {
  const settings = await getScoringSettings();
  const count = settings.workerCount || 1;
  ensurePool(count);

  const active = new Set();
  const launch = () => {
    while (active.size < count && S.running && !S.paused) {
      const nextId = pickNextIndividual();
      if (!nextId) break;
      const p = S.pendingByIndividual.get(nextId);
      if (!p || p.size === 0) break;
      active.add(nextId);
      S.activeScoringIds.add(nextId);
      scoreIndividual(nextId)
        .catch((err) => console.error(`Queue: scoreIndividual failed for ${nextId}`, err))
        .then(() => {
          active.delete(nextId);
          S.activeScoringIds.delete(nextId);
          if (S.running && !S.paused) launch();
          if (active.size === 0 && !pickNextIndividual()) {
            S.running = false;
            release();
            stopHeartbeat();
            notifyNow();
          }
        });
    }
    if (active.size === 0) {
      S.running = false;
      release();
      stopHeartbeat();
      notifyNow();
    }
  };
  launch();
}

/** Pause all workers. */
export async function pauseRunner() {
  for (const s of getAllSessions()) {
    if (isSessionScoring(s)) await stopSession(s).catch((e) => console.warn('pause:', e));
    s.loadedDnaId = '';
  }
}

/** Abort for reprioritization. */
export function abortForReprioritize() {
  for (const s of getAllSessions())
    if (isSessionScoring(s)) stopSession(s).catch((e) => console.warn('abort:', e));
}

/** Reset runner state. */
export async function resetRunner() {
  await destroyPool();
}
