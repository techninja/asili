/**
 * Tests for gene-table-columns — cell values, sort values, column config.
 * @module components/organisms/gene-table/gene-table-columns.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_COLS, cellValue, sortValue, isNumeric } from './gene-table-columns.js';

const GENE = {
  symbol: 'BRCA1',
  emoji: '🎀',
  chr: '17',
  start: 43044294,
  category: 'Cancer Risk',
  publications: 3454,
  exon_count: 31,
  map_location: '17q21.31',
};

const STATS = {
  BRCA1: { total: 500, imputed: 400, genotyped: 100, nonref: 42 },
};

describe('gene-table-columns', () => {
  describe('ALL_COLS', () => {
    it('has expected default visible columns', () => {
      const visible = ALL_COLS.filter((c) => c.on).map((c) => c.id);
      assert.ok(visible.includes('symbol'));
      assert.ok(visible.includes('chr'));
      assert.ok(visible.includes('publications'));
      assert.ok(!visible.includes('exon_count'));
    });
  });

  describe('cellValue', () => {
    it('returns emoji + symbol for symbol column', () => {
      assert.equal(cellValue(GENE, 'symbol', null), '🎀 BRCA1');
    });

    it('returns chromosome', () => {
      assert.equal(cellValue(GENE, 'chr', null), '17');
    });

    it('returns formatted publications', () => {
      assert.equal(cellValue(GENE, 'publications', null), '3,454');
    });

    it('returns variant stats from profile', () => {
      assert.equal(cellValue(GENE, 'variants', STATS), '500');
      assert.equal(cellValue(GENE, 'nonref', STATS), '42');
    });

    it('returns dash when no stats available', () => {
      assert.equal(cellValue(GENE, 'variants', null), '\u2014');
      assert.equal(cellValue(GENE, 'nonref', {}), '\u2014');
    });

    it('returns exon count', () => {
      assert.equal(cellValue(GENE, 'exon_count', null), 31);
    });
  });

  describe('sortValue', () => {
    it('returns symbol string for name sort', () => {
      assert.equal(sortValue(GENE, 'symbol', null), 'BRCA1');
    });

    it('returns numeric position for chr sort', () => {
      const v = sortValue(GENE, 'chr', null);
      assert.equal(typeof v, 'number');
      assert.ok(v > 0);
    });

    it('returns publication count', () => {
      assert.equal(sortValue(GENE, 'publications', null), 3454);
    });

    it('returns stats values when available', () => {
      assert.equal(sortValue(GENE, 'variants', STATS), 500);
      assert.equal(sortValue(GENE, 'nonref', STATS), 42);
    });

    it('returns 0 for missing stats', () => {
      assert.equal(sortValue(GENE, 'variants', null), 0);
    });
  });

  describe('isNumeric', () => {
    it('marks publications as numeric', () => {
      assert.equal(isNumeric('publications'), true);
    });

    it('marks symbol as non-numeric', () => {
      assert.equal(isNumeric('symbol'), false);
    });

    it('marks variants as numeric', () => {
      assert.equal(isNumeric('variants'), true);
    });
  });
});
