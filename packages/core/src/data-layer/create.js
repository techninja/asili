/**
 * Data layer factory — detect mode, return adapter.
 * @module packages/core/src/data-layer/create
 */

import { createBrowserAdapter } from './browser-adapter.js';
import { validateAdapter } from './interface.js';

/**
 * Detect whether a hybrid server is available.
 * @returns {Promise<'browser'|'hybrid'>}
 */
async function detectMode() {
  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) return 'hybrid';
  } catch { /* no server */ }
  return 'browser';
}

/** @type {import('./interface.js').DataLayer|null} */
let instance = null;

/**
 * Create and initialize the data layer singleton.
 * @param {object} [opts]
 * @param {'browser'|'hybrid'|'auto'} [opts.mode='auto']
 * @param {string} [opts.manifestUrl]
 * @returns {Promise<import('./interface.js').DataLayer>}
 */
export async function createDataLayer(opts = {}) {
  if (instance) return instance;

  const mode = opts.mode === 'auto' || !opts.mode
    ? await detectMode() : opts.mode;

  if (mode === 'hybrid') {
    // Hybrid adapter is post-launch — fall back to browser for now
    instance = createBrowserAdapter(opts.manifestUrl);
  } else {
    instance = createBrowserAdapter(opts.manifestUrl);
  }

  if (!validateAdapter(instance)) {
    throw new Error('Data layer adapter missing required methods');
  }

  await instance.initialize();
  return instance;
}

/**
 * Get the existing data layer instance (must call createDataLayer first).
 * @returns {import('./interface.js').DataLayer}
 */
export function getDataLayer() {
  if (!instance) throw new Error('Data layer not initialized — call createDataLayer() first');
  return instance;
}

/** Reset singleton (for testing). */
export function resetDataLayer() { instance = null; }
