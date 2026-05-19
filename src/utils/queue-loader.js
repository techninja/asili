/**
 * Queue loader — loads DNA data into a worker session for an individual.
 * @module utils/queue-loader
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { loadDNA } from './worker-pool.js';
import { S, markAllError } from './queue-state.js';

/**
 * Load DNA for an individual into a worker session.
 * @param {object} session
 * @param {string} individualId
 * @param {Function} [onProgress] - callback({ phase, done, total })
 */
export async function loadIndividualDNA(session, individualId, onProgress) {
  const isImputed = S.individualMeta.get(individualId);
  if (isImputed) {
    const file = S.imputedFiles.get(individualId);
    if (!file) {
      markAllError(individualId, 'Imputed file not available — re-upload needed');
      throw new Error('No imputed file');
    }
    await loadDNA(session, null, file);
  } else {
    const stored = await idb.get('variants', individualId);
    if (!stored?.variants) {
      markAllError(individualId, 'No variant data');
      throw new Error('No variant data');
    }
    await loadDNA(session, stored.variants, undefined, onProgress);
  }
}
