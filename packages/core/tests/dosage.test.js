/**
 * Dosage orientation and genotyped dosage computation tests.
 * Verifies the core allele orientation logic used in SQL scoring.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const r = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

// Simulate what the SQL CTE does for a single variant
function orientedDosage(variantId, effectAllele, genotypeDosage) {
  const parts = variantId.split(':');
  const a3 = parts[2], a4 = parts[3];
  const alt = a3 > a4 ? a3 : a4;
  return effectAllele === alt ? genotypeDosage : 2.0 - genotypeDosage;
}

describe('dosage orientation logic', () => {
  it('effect=alt, hom alt → 2', () => assert.equal(orientedDosage('1:100:A:G', 'G', 2), 2));
  it('effect=alt, het → 1', () => assert.equal(orientedDosage('1:100:A:G', 'G', 1), 1));
  it('effect=alt, hom ref → 0', () => assert.equal(orientedDosage('1:100:A:G', 'G', 0), 0));
  it('effect=ref, hom ref → 2', () => assert.equal(orientedDosage('1:100:A:G', 'A', 0), 2));
  it('effect=ref, het → 1', () => assert.equal(orientedDosage('1:100:A:G', 'A', 1), 1));
  it('effect=ref, hom alt → 0', () => assert.equal(orientedDosage('1:100:A:G', 'A', 2), 0));
  it('imputed fractional, effect=ref', () => {
    assert.equal(r(orientedDosage('1:100:A:G', 'A', 0.8)), 1.2);
  });
  it('imputed fractional, effect=alt', () => {
    assert.equal(orientedDosage('1:100:A:G', 'G', 0.8), 0.8);
  });
});

describe('genotyped dosage computation', () => {
  function genotypedDosage(a1, a2) {
    const ref = a1 < a2 ? a1 : a2;
    return a1 === a2 ? (a1 === ref ? 0.0 : 2.0) : 1.0;
  }

  it('AG → 1', () => assert.equal(genotypedDosage('A', 'G'), 1));
  it('GA → 1', () => assert.equal(genotypedDosage('G', 'A'), 1));
  it('CT → 1', () => assert.equal(genotypedDosage('C', 'T'), 1));
  // Homozygous: allele_key = md5(x:x) won't match trait packs
  it('AA → 0 (hom, allele_key mismatch)', () => assert.equal(genotypedDosage('A', 'A'), 0));
  it('GG → 0 (hom, allele_key mismatch)', () => assert.equal(genotypedDosage('G', 'G'), 0));
});

describe('contribution = weight × oriented_dosage × iq_factor', () => {
  function contribution(weight, od, imputed, iq) {
    return weight * od * (imputed && iq !== null ? Math.sqrt(iq) : 1.0);
  }

  it('+weight, dosage 2, genotyped', () => assert.equal(contribution(0.5, 2, false, null), 1.0));
  it('-weight, dosage 1, genotyped', () => assert.equal(contribution(-0.3, 1, false, null), -0.3));
  it('imputed iq=0.81 → 0.45', () => assert.equal(r(contribution(0.5, 1, true, 0.81)), 0.45));
  it('imputed iq=null → 0.5', () => assert.equal(contribution(0.5, 1, true, null), 0.5));
  it('zero weight → 0', () => assert.equal(contribution(0, 2, false, null), 0));
  it('zero dosage → 0', () => assert.equal(contribution(0.5, 0, false, null), 0));
});
