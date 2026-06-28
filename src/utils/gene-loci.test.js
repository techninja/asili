/**
 * Tests for profile-gene-stats — gene loci extraction.
 * @module utils/profile-gene-stats.test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGeneLoci } from './gene-loci.js';

describe('profile-gene-stats', () => {
  describe('getGeneLoci', () => {
    beforeEach(() => {
      globalThis.window = /** @type {any} */ ({});
    });

    afterEach(() => {
      delete globalThis.window;
    });

    it('returns empty array when no catalog loaded', async () => {
      const loci = await getGeneLoci();
      assert.deepEqual(loci, []);
    });

    it('extracts loci from cached catalog', async () => {
      /** @type {any} */ (globalThis.window).__asiliGeneCatalog = {
        genes: [
          { symbol: 'BRCA1', chr: '17', start: 43044294, end: 43170326, name: 'test' },
          { symbol: 'TP53', chr: '17', start: 7668402, end: 7687538, name: 'test2' },
        ],
      };
      const loci = await getGeneLoci();
      assert.equal(loci.length, 2);
      assert.equal(loci[0].symbol, 'BRCA1');
      assert.equal(loci[0].chr, '17');
      assert.equal(loci[0].start, 43044294);
      assert.equal(loci[0].end, 43170326);
    });

    it('only returns symbol, chr, start, end fields', async () => {
      /** @type {any} */ (globalThis.window).__asiliGeneCatalog = {
        genes: [
          {
            symbol: 'FTO',
            chr: '16',
            start: 53703963,
            end: 54121941,
            name: 'extra',
            category: 'Metabolism',
          },
        ],
      };
      const loci = await getGeneLoci();
      assert.deepEqual(Object.keys(loci[0]).sort(), ['chr', 'end', 'start', 'symbol']);
    });
  });
});
