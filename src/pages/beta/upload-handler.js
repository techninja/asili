/**
 * Upload handler — connects file input to parser, scoring worker, and UI.
 * @module pages/beta/upload-handler
 */

import { parseDNAFile } from '/packages/core/src/parser/parse.js';
import { initScoring, loadDNA, scoreAll } from '../../utils/scoring.js';
import { getTraitList } from '../../utils/manifest.js';
import { setResult } from './results-store.js';

/**
 * @typedef {object} BetaViewHost
 * @property {string} parseStatus
 * @property {string} parseError
 * @property {number} parsedCount
 * @property {string} parsedFormat
 * @property {string} individualName
 * @property {string} scoringStatus
 * @property {number} scoringCurrent
 * @property {number} scoringTotal
 * @property {string} scoringTrait
 * @property {number} resultCount
 */

/**
 * Handle file-selected event from upload-zone.
 * @param {BetaViewHost & HTMLElement} host
 * @param {CustomEvent} event
 */
export async function handleFileSelected(host, event) {
  const file = event.detail;
  if (!file) return;

  host.parseStatus = 'parsing';
  host.parseError = '';
  host.parsedCount = 0;

  try {
    const text = await file.text();
    const result = parseDNAFile(text, ({ parsed }) => {
      host.parsedCount = parsed;
    });

    if (result.format === 'unknown') {
      host.parseStatus = 'error';
      host.parseError = 'Unrecognized file format.';
      return;
    }

    host.parsedCount = result.variants.length;
    host.parsedFormat = result.format;
    host.individualName = file.name.replace(/\.[^.]+$/, '');
    host.parseStatus = 'done';

    // Scoring available via manual trigger — not auto-started during dev
  } catch (err) {
    host.parseStatus = 'error';
    host.parseError = `Failed to parse: ${err.message}`;
  }
}

/**
 * Initialize DuckDB worker, load DNA, score all traits.
 * @param {BetaViewHost & HTMLElement} host
 * @param {Array<object>} variants
 */
async function startScoring(host, variants) {
  host.scoringStatus = 'init';
  try {
    await initScoring();
    await loadDNA(variants);
    host.scoringStatus = 'scoring';

    const traits = await getTraitList();
    await scoreAll(traits, '/data', {
      onProgress: ({ current, total, traitName }) => {
        host.scoringCurrent = current;
        host.scoringTotal = total;
        host.scoringTrait = traitName;
      },
      onTraitScored: ({ traitId, result }) => {
        setResult(traitId, result);
        host.resultCount++;
      },
    });
    host.scoringStatus = 'done';
  } catch (err) {
    host.scoringStatus = 'error';
    host.parseError = `Scoring failed: ${err.message}`;
  }
}
