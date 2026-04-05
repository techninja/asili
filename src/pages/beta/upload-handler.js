/**
 * Upload handler — connects file input to parser and data layer.
 * @module pages/beta/upload-handler
 */

import { parseDNAFile } from '/packages/core/src/parser/parse.js';

/**
 * @typedef {object} BetaViewHost
 * @property {string} parseStatus
 * @property {string} parseError
 * @property {number} parsedCount
 * @property {string} parsedFormat
 * @property {string} individualName
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
      host.parseError =
        'Unrecognized file format. Supported: 23andMe, AncestryDNA, MyHeritage, FamilyTreeDNA, VCF.';
      return;
    }

    host.parsedCount = result.variants.length;
    host.parsedFormat = result.format;
    host.individualName = file.name.replace(/\.[^.]+$/, '');
    host.parseStatus = 'done';
  } catch (err) {
    host.parseStatus = 'error';
    host.parseError = `Failed to parse file: ${err.message}`;
  }
}
