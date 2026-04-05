import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Parse model defaults from source without importing (avoids hybrids/window).
 * @param {string} path
 * @returns {Record<string, string>}
 */
function extractDefaults(path) {
  const src = readFileSync(path, 'utf8');
  const defaults = {};
  const re = /^\s+(\w+):\s*(.+?),?\s*$/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1] === 'store' || m[1] === 'value') continue;
    defaults[m[1]] = m[2].trim().replace(/,$/, '');
  }
  return defaults;
}

describe('store model shapes', () => {
  it('AppState has required fields', () => {
    const d = extractDefaults('src/store/AppState.js');
    assert.equal(d.theme, "'dark'");
    assert.equal(d.sortBy, "'name'");
    assert.equal(d.isProcessing, 'false');
    assert.equal(d.tier, '1');
    assert.ok('activeIndividualId' in d);
    assert.ok('searchQuery' in d);
  });

  it('IndividualModel has required fields', () => {
    const d = extractDefaults('src/store/IndividualModel.js');
    assert.equal(d.id, 'true');
    assert.equal(d.status, "'importing'");
    assert.equal(d.hasImputed, 'false');
    assert.ok('name' in d);
    assert.ok('emoji' in d);
    assert.ok('variantCount' in d);
  });

  it('TraitModel has required fields', () => {
    const d = extractDefaults('src/store/TraitModel.js');
    assert.equal(d.id, 'true');
    assert.equal(d.traitType, "'disease_risk'");
    assert.ok('name' in d);
    assert.ok('pgsCount' in d);
    assert.ok('phenotypeMean' in d);
  });

  it('ResultModel has required fields', () => {
    const d = extractDefaults('src/store/ResultModel.js');
    assert.equal(d.id, 'true');
    assert.equal(d.confidence, "'none'");
    assert.ok('zScore' in d);
    assert.ok('percentile' in d);
    assert.ok('matchedVariants' in d);
    assert.ok('bestPGSQualityScore' in d);
  });
});
