/**
 * Beta dashboard handlers — file parsing and individual creation.
 * @module pages/beta/beta-handlers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { parseDNAFile } from '/packages/core/src/parser/parse.js';
import { loadResults } from './results-store.js';
import { startScoring } from './scoring-controller.js';

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleFile(host, e) {
  const file = e.detail;
  if (!file) return;
  host.parseStatus = 'parsing';
  host.parsedCount = 0;
  host.parsedFilename = file.name;
  try {
    const text = await file.text();
    const result = parseDNAFile(text, ({ parsed }) => {
      host.parsedCount = parsed;
    });
    if (result.format === 'unknown') {
      host.parseStatus = '';
      return;
    }
    host.parsedCount = result.variants.length;
    host.parsedFormat = result.format;
    host._variants = result.variants;
    host.parseStatus = 'setup';
  } catch {
    host.parseStatus = '';
  }
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleSetup(host, e) {
  const { name, emoji } = e.detail;
  const id = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
  await idb.openDB();
  await idb.put('individuals', id, {
    id,
    name,
    emoji,
    relationship: 'self',
    variantCount: host.parsedCount,
    status: 'ready',
    hasImputed: false,
  });
  await idb.put('variants', id, {
    variants: host._variants,
    metadata: { format: host.parsedFormat },
  });
  host.parseStatus = '';
  host._variants = [];
  host.showUpload = false;
  host.individuals = await idb.getAll('individuals');
  host.activeId = id;
  host.resultCount = 0;
  await loadResults(id);
  startScoring(host, id);
}
