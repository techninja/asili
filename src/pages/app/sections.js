/**
 * Beta dashboard handlers — file parsing and individual creation.
 * Supports text DNA files and .asili imputed archives.
 * @module pages/app/beta-handlers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { parseDNAFile } from '/packages/core/src/parser/parse.js';
import { validateAsili } from '#utils/asili-validator.js';
import { loadResults } from './results-store.js';
import { onNewIndividual } from './scoring-controller.js';

/** @type {File|null} Module-level to avoid Hybrids cache serialization */
let imputedFile = null;
/** @type {FileSystemFileHandle|null} */
let imputedHandle = null;

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleFile(host, e) {
  const { file, handle } = e.detail || {};
  if (!file) return;
  host.parseStatus = 'parsing';
  host.parsedCount = 0;
  host.parsedFilename = file.name;
  host._manifest = '';
  host.parseError = '';

  if (file.name.endsWith('.asili')) {
    const result = await validateAsili(file);
    if (!result.ok) {
      host.parseStatus = 'error';
      host.parseError = result.error;
      return;
    }
    imputedFile = file;
    imputedHandle = handle || null;
    host._variants = [];
    host._manifest = JSON.stringify(result.manifest);
    host.parsedFormat = 'asili-imputed';
    host.parsedCount = result.manifest.totalVariants || 0;
    host.parseStatus = 'setup';
    return;
  }

  try {
    imputedFile = null;
    imputedHandle = null;
    const text = await file.text();
    const result = parseDNAFile(text, ({ parsed }) => {
      host.parsedCount = parsed;
    });
    if (result.format === 'unknown') {
      host.parseStatus = 'error';
      host.parseError = 'Unrecognized file format';
      return;
    }
    host.parsedCount = result.variants.length;
    host.parsedFormat = result.format;
    host._variants = result.variants;
    host.parseStatus = 'setup';
  } catch (err) {
    host.parseStatus = 'error';
    host.parseError = `Failed to parse: ${err.message}`;
  }
}

/** @returns {File|null} */
export function getPendingImputedFile() {
  return imputedFile;
}

/** @returns {FileSystemFileHandle|null} */
export function getPendingImputedHandle() {
  return imputedHandle;
}

/** Clear the pending imputed file */
export function clearPendingImputedFile() {
  imputedFile = null;
  imputedHandle = null;
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleSetup(host, e) {
  const { name, emoji, emojiParams, ancestry } = e.detail;
  const isImputed = host.parsedFormat === 'asili-imputed';
  const id = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
  await idb.openDB();
  await idb.put('individuals', id, {
    id,
    name,
    emoji,
    emojiParams: emojiParams || '',
    ancestry: ancestry || '',
    relationship: 'self',
    variantCount: host.parsedCount,
    status: 'ready',
    hasImputed: isImputed,
  });
  if (!isImputed) {
    await idb.put('variants', id, {
      variants: host._variants,
      metadata: { format: host.parsedFormat },
    });
  }
  host.parseStatus = '';
  host._variants = [];
  host._manifest = '';
  host.parseError = '';
  host.showUpload = false;
  host.individuals = await idb.getAll('individuals');
  host.activeId = id;
  host.resultCount = 0;
  await loadResults(id);
  onNewIndividual(host, id);
}
