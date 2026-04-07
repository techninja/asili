/**
 * Scoring service — promise-based wrapper around the scoring Web Worker.
 * Supports abort via stopScoring().
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
/** @type {number} Active scoring run ID — callbacks ignored if stale. */
let activeScoringRunId = 0;

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
 * Load parsed DNA variants or imputed .asili File into the worker.
 * @param {Array<object>|null} variants
 * @param {File} [imputedFile]
 * @returns {Promise<{variantCount: number}>}
 */
export function loadDNA(variants, imputedFile) {
  if (imputedFile) return send('loadDNA', { imputedFile });
  return send('loadDNA', { variants });
}

/**
 * Score all traits. Calls onProgress and onTraitScored callbacks.
 * @param {Array<object>} traits
 * @param {string} dataPath
 * @param {object} callbacks
 * @returns {Promise<void>}
 */
export function scoreAll(traits, dataPath, callbacks = {}) {
  onProgress = callbacks.onProgress || null;
  onTraitScored = callbacks.onTraitScored || null;
  const promise = send('scoreAll', { traits, dataPath: `${window.location.origin}${dataPath}` });
  activeScoringRunId = msgId;
  return promise;
}

/**
 * Stop the current scoring run. Worker finishes current trait then stops.
 * @returns {Promise<void>}
 */
export function stopScoring() {
  activeScoringRunId = 0;
  onProgress = null;
  onTraitScored = null;
  return send('abort', {});
}

/** @returns {boolean} */
export function isScoring() {
  return activeScoringRunId > 0;
}

/** @param {MessageEvent} e */
function handleMessage(e) {
  const { type, id } = e.data;

  if ((type === 'progress' || type === 'scored') && id !== activeScoringRunId) return;

  if (type === 'progress' && onProgress) {
    onProgress(e.data);
  } else if (type === 'scored' && onTraitScored) {
    onTraitScored(e.data);
  } else if (type === 'traitError') {
    console.error(`Scoring error for ${e.data.traitId}:`, e.data.error);
  }

  if (type === 'ready' || type === 'dnaLoaded' || type === 'allDone' || type === 'aborted') {
    if (type === 'allDone' || type === 'aborted') activeScoringRunId = 0;
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
