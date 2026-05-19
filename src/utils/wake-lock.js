/**
 * Wake lock — prevents device sleep during scoring.
 * Uses Screen Wake Lock API (Chrome/Edge). Falls back gracefully.
 * Re-acquires automatically when page regains visibility.
 * @module utils/wake-lock
 */

/** @type {WakeLockSentinel|null} */
let lock = null;
/** @type {boolean} */
let wanted = false;

/** Acquire wake lock. Call when scoring starts. */
export async function acquire() {
  wanted = true;
  if (lock || document.visibilityState === 'hidden') return;
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
  wanted = false;
  if (lock) {
    await lock.release();
    lock = null;
  }
}

/** @returns {boolean} */
export function isActive() {
  return !!lock;
}

// Re-acquire when page becomes visible again (lock auto-releases on hide)
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible' && !lock) acquire();
});
