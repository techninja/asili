/**
 * Upload handler — parse → individual setup → persist → score.
 * @module pages/beta/upload-handler
 */

import { parseDNAFile } from '/packages/core/src/parser/parse.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { initScoring, loadDNA, scoreAll, stopScoring, isScoring } from '#utils/scoring.js';
import { getTraitList } from '#utils/manifest.js';
import { setResult, loadResults } from './results-store.js';

/** Handle file-selected event — parse DNA, transition to setup step. */
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
    host._variants = result.variants;
    host.parseStatus = 'setup';
  } catch (err) {
    host.parseStatus = 'error';
    host.parseError = `Failed to parse: ${err.message}`;
  }
}

/** Handle setup-complete — create individual, store variants, start scoring. */
export async function handleSetupComplete(host, event) {
  const { name, emoji } = event.detail;
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

  host.individualId = id;
  host.individualName = `${emoji} ${name}`;
  host.parseStatus = 'done';
  await loadResults(id);

  startScoring(host, host._variants);
}

/** Resume a previous individual — load results, optionally re-score. */
export async function resumeIndividual(host, individual) {
  host.individualId = individual.id;
  host.individualName = `${individual.emoji} ${individual.name}`;
  host.parsedCount = individual.variantCount;
  host.parseStatus = 'done';

  const count = await loadResults(individual.id);
  host.resultCount = count;

  if (count === 0) {
    const stored = await idb.get('variants', individual.id);
    if (stored?.variants) startScoring(host, stored.variants);
  }
}

/** Switch active individual (from done state). Stops active scoring first. */
export async function switchTo(host, individual) {
  if (isScoring()) await stopScoring();
  host.individualId = individual.id;
  host.individualName = `${individual.emoji} ${individual.name}`;
  host.parsedCount = individual.variantCount;
  host.scoringStatus = '';

  const count = await loadResults(individual.id);
  host.resultCount = count;

  if (count === 0) {
    const stored = await idb.get('variants', individual.id);
    if (stored?.variants) startScoring(host, stored.variants);
  }
}

/** Stop scoring and update UI state. */
export async function handleStopScoring(host) {
  await stopScoring();
  host.scoringStatus = host.resultCount > 0 ? 'done' : '';
}

/** @param {object & HTMLElement} host @param {Array<object>} variants */
async function startScoring(host, variants) {
  host.scoringStatus = 'init';
  try {
    await initScoring();
    await loadDNA(variants);
    host.scoringStatus = 'scoring';
    const traits = await getTraitList();
    host.scoringTotal = traits.length;

    await scoreAll(traits, '/data', {
      onProgress: ({ current, total, traitName }) => {
        host.scoringCurrent = current;
        host.scoringTotal = total;
        host.scoringTrait = traitName;
      },
      onTraitScored: async ({ traitId, result }) => {
        await setResult(traitId, result);
        host.resultCount++;
      },
    });
    host.scoringStatus = 'done';
  } catch (err) {
    host.scoringStatus = 'error';
    host.parseError = `Scoring failed: ${err.message}`;
  }
}
