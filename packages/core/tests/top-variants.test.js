import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGenotype } from '../src/duckdb/top-variants.js';

describe('buildGenotype', () => {
  it('homozygous alt (dosage ≈ 2)', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 2, imputed: false, ref_allele: 'A', alt_allele: 'G',
    }), 'GG');
  });

  it('heterozygous (dosage ≈ 1)', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 1, imputed: false, ref_allele: 'A', alt_allele: 'G',
    }), 'AG');
  });

  it('homozygous ref (dosage ≈ 0)', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 0.01, imputed: false, ref_allele: 'T', alt_allele: 'C',
    }), 'TT');
  });

  it('imputed shows tilde + dosage', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 1.3, imputed: true, ref_allele: 'A', alt_allele: 'G',
    }), '~1.3');
  });

  it('imputed low dosage shows 3 decimals', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 0.005, imputed: true, ref_allele: 'A', alt_allele: 'G',
    }), '~0.005');
  });

  it('missing alleles falls back to ×dosage', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 2, imputed: false, ref_allele: '', alt_allele: '',
    }), '×2');
  });

  it('null alleles falls back to ×dosage', () => {
    assert.equal(buildGenotype({
      genotype_dosage: 1, imputed: false, ref_allele: null, alt_allele: null,
    }), '×1');
  });
});
