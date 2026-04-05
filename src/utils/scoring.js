/**
 * Scoring service — promise-based wrapper around the scoring Web Worker.
 * @module utils/scoring
 */

/** @type {Worker|null} */
let worker = null;
let msgId = 0;
/** @type {Map<number, {resolve: Function, reject: Function}>} */
const pending = new Map();
/** @type {Function|null} */
let onProgress = null;
/** @type {Function|null} */
let onTraitScored = null;

/**
 * Initialize the scoring worker and DuckDB WASM.
 * @returns {Promise<void>}
 */
export async function initScoring() {
  if (worker) return;
  worker = new Worker('/workers/scoring-worker.js', { type: 'module' });
  worker.onmessage = handleMessage;
  return send('init', { origin: window.location.origin });
}

/**
 * Load parsed DNA variants into the worker.
 * @param {Array<object>} variants
 * @returns {Promise<{variantCount: number}>}
 */
export function loadDNA(variants) {
  return send('loadDNA', { variants });
}

/**
 * Score all traits. Calls onProgress and onTraitScored callbacks.
 * @param {Array<object>} traits - From manifest
 * @param {string} dataPath - Base URL for parquet files
 * @param {object} callbacks
 * @returns {Promise<void>}
 */
export function scoreAll(traits, dataPath, callbacks = {}) {
  onProgress = callbacks.onProgress || null;
  onTraitScored = callbacks.onTraitScored || null;
  return send('scoreAll', { traits, dataPath: `${window.location.origin}${dataPath}` });
}

/** @param {object} e */
function handleMessage(e) {
  const { type, id } = e.data;
  if (type === 'progress' && onProgress) {
    onProgress(e.data);
  } else if (type === 'scored' && onTraitScored) {
    onTraitScored(e.data);
  }
  if (type === 'ready' || type === 'dnaLoaded' || type === 'allDone') {
    pending.get(id)?.resolve(e.data);
    pending.delete(id);
  } else if (type === 'error') {
    pending.get(id)?.reject(new Error(e.data.error));
    pending.delete(id);
  }
}

/**
 * @param {string} type
 * @param {object} [data]
 * @returns {Promise<any>}
 */
function send(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    worker?.postMessage({ type, id, ...data });
  });
}
