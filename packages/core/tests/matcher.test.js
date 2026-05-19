import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  positionKey, resolveAlleleDosage, countEffectAlleles, buildPositionMap,
} from '../src/matcher.js';

describe('positionKey', () => {
  it('extracts chr:pos from chr:pos:ref:alt', () => {
    assert.equal(positionKey('1:12345:A:G'), '1:12345');
  });

  it('returns full string for chr:pos only', () => {
    assert.equal(positionKey('1:12345'), '1:12345');
  });

  it('returns null for rsid without colon', () => {
    assert.equal(positionKey('rs12345'), null);
  });

  it('handles chr prefix', () => {
    assert.equal(positionKey('chr1:99999:T:C'), 'chr1:99999');
  });
});

describe('resolveAlleleDosage', () => {
  it('returns raw dosage when alleles match', () => {
    assert.equal(resolveAlleleDosage('A', 'G', 'A', 'G', 1.5), 1.5);
  });

  it('flips dosage when alleles are swapped', () => {
    assert.equal(resolveAlleleDosage('A', 'G', 'G', 'A', 1.5), 0.5);
  });

  it('returns null for incompatible alleles', () => {
    assert.equal(resolveAlleleDosage('A', 'G', 'C', 'T', 1.0), null);
  });

  it('handles dosage 0 flip', () => {
    assert.equal(resolveAlleleDosage('A', 'G', 'G', 'A', 0), 2);
  });

  it('handles dosage 2 flip', () => {
    assert.equal(resolveAlleleDosage('A', 'G', 'G', 'A', 2), 0);
  });
});

describe('countEffectAlleles', () => {
  it('returns 2 for homozygous effect', () => {
    assert.equal(countEffectAlleles('A', 'A', 'A'), 2);
  });

  it('returns 1 for heterozygous', () => {
    assert.equal(countEffectAlleles('A', 'G', 'A'), 1);
  });

  it('returns 0 for no match', () => {
    assert.equal(countEffectAlleles('G', 'G', 'A'), 0);
  });
});

describe('buildPositionMap', () => {
  it('builds map keyed by chr:pos', () => {
    const variants = [
      { chromosome: '1', position: 100, allele1: 'A', allele2: 'G' },
      { chromosome: '2', position: 200, allele1: 'T', allele2: 'C' },
    ];
    const map = buildPositionMap(variants);
    assert.equal(map.size, 2);
    assert.equal(map.get('1:100'), variants[0]);
    assert.equal(map.get('2:200'), variants[1]);
  });

  it('skips variants without chromosome or position', () => {
    const variants = [
      { chromosome: '1', position: 100, allele1: 'A', allele2: 'G' },
      { rsid: 'rs123' },
    ];
    const map = buildPositionMap(variants);
    assert.equal(map.size, 1);
  });
});
