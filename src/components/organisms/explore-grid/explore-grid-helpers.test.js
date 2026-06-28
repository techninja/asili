/**
 * Tests for explore-grid-helpers — search, filter, sort, hue.
 * @module components/organisms/explore-grid/explore-grid-helpers.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterGenes, geneHue } from './explore-grid-helpers.js';

const GENES = [
  {
    symbol: 'BRCA1',
    name: 'BRCA1 DNA repair',
    chr: '17',
    start: 43044294,
    publications: 3454,
    category: 'Cancer Risk',
    social_tags: ['breast cancer', 'hereditary'],
  },
  {
    symbol: 'MTHFR',
    name: 'Methylenetetrahydrofolate reductase',
    chr: '1',
    start: 11785722,
    publications: 2100,
    category: 'Vitamins & Nutrients',
    social_tags: ['folate', 'homocysteine'],
  },
  {
    symbol: 'APOE',
    name: 'Apolipoprotein E',
    chr: '19',
    start: 44905781,
    publications: 5200,
    category: 'Brain & Mood',
    social_tags: ["alzheimer's", 'cholesterol'],
  },
];

describe('explore-grid-helpers', () => {
  describe('filterGenes', () => {
    it('returns all genes with no filters', () => {
      const result = filterGenes(GENES, {
        search: '',
        category: '',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 3);
    });

    it('filters by symbol search', () => {
      const result = filterGenes(GENES, {
        search: 'brca',
        category: '',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].symbol, 'BRCA1');
    });

    it('filters by social tag search', () => {
      const result = filterGenes(GENES, {
        search: 'folate',
        category: '',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].symbol, 'MTHFR');
    });

    it('filters by category', () => {
      const result = filterGenes(GENES, {
        search: '',
        category: 'Brain & Mood',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].symbol, 'APOE');
    });

    it('sorts by name ascending', () => {
      const result = filterGenes(GENES, {
        search: '',
        category: '',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result[0].symbol, 'APOE');
      assert.equal(result[2].symbol, 'MTHFR');
    });

    it('sorts by publications descending', () => {
      const result = filterGenes(GENES, {
        search: '',
        category: '',
        sortBy: 'publications',
        sortDir: 'desc',
      });
      assert.equal(result[0].symbol, 'APOE');
      assert.equal(result[2].symbol, 'MTHFR');
    });

    it('combines search + category', () => {
      const result = filterGenes(GENES, {
        search: 'cancer',
        category: 'Cancer Risk',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 1);
      assert.equal(result[0].symbol, 'BRCA1');
    });

    it('returns empty for no matches', () => {
      const result = filterGenes(GENES, {
        search: 'zzzzz',
        category: '',
        sortBy: 'name',
        sortDir: 'asc',
      });
      assert.equal(result.length, 0);
    });
  });

  describe('geneHue', () => {
    it('returns a number between 0 and 360', () => {
      for (const g of GENES) {
        const h = geneHue(g);
        assert.ok(h >= 0 && h <= 360, `${g.symbol}: hue ${h} out of range`);
      }
    });

    it('chr1 gene has lower hue than chr19 gene', () => {
      assert.ok(geneHue(GENES[1]) < geneHue(GENES[2]));
    });

    it('is deterministic', () => {
      assert.equal(geneHue(GENES[0]), geneHue(GENES[0]));
    });
  });
});
