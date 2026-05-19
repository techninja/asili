/**
 * Heartbeat monitor — logs memory, timing, and scoring state periodically.
 * Helps diagnose SIGILL crashes by leaving breadcrumbs before death.
 * @module utils/heartbeat
 */

import { S } from './queue-state.js';

/** @type {ReturnType<typeof setInterval>|null} */
let interval = null;
let beatCount = 0;

/** Start heartbeat logging. */
export function startHeartbeat() {
  if (interval) return;
  beatCount = 0;
  interval = setInterval(beat, 5000);
  beat();
}

/** Stop heartbeat logging. */
export function stopHeartbeat() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

/**
 *
 */
function beat() {
  beatCount++;
  const mem = /** @type {any} */ (performance)?.memory;
  const memInfo = mem
    ? `heap=${mb(mem.usedJSHeapSize)}/${mb(mem.totalJSHeapSize)}MB limit=${mb(mem.jsHeapSizeLimit)}MB`
    : 'no memory API';
  const scoring = S.running
    ? `scoring=${S.currentTraitName} chr=${S.currentChrDone}/${S.currentChrTotal}`
    : 'idle';
  const stats = `done=${S.traitsCompleted} variants=${S.totalVariantsScored}+${S.liveVariants}`;
  const ts = new Date().toLocaleTimeString();
  console.log(`[heartbeat #${beatCount} ${ts}] ${memInfo} | ${scoring} | ${stats}`);
}

/** @param {number} bytes */
function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(0);
}
