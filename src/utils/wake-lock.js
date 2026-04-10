/**
 * Wake lock — prevents device sleep and signals active work during scoring.
 * Uses Screen Wake Lock API (Chrome/Edge). Falls back gracefully.
 * @module utils/wake-lock
 */

/** @type {WakeLockSentinel|null} */
let lock = null;

/** Acquire wake lock. Call when scoring starts. */
export async function acquire() {
  if (lock) return;
  try {
    if ('wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
      });
    }
  } catch (e) {
    console.warn('Wake lock failed:', e.message);
  }
}

/** Release wake lock. Call when scoring pauses/completes. */
export async function release() {
  if (lock) {
    await lock.release();
    lock = null;
  }
}

/** @returns {boolean} */
export function isActive() {
  return !!lock;
}
