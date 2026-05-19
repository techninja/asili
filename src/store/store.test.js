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
});
