import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTraitValue } from '../src/formatter.js';

describe('formatTraitValue', () => {
  it('formats standard units', () => {
    const r = formatTraitValue(142.3, 'mg/dL');
    assert.equal(r.display, '142.3 mg/dL');
    assert.equal(r.unit, 'mg/dL');
  });

  it('formats BMI with kg/m² suffix', () => {
    const r = formatTraitValue(27.4, 'kg/m²');
    assert.equal(r.display, '27.4 kg/m²');
  });

  it('formats percentage without space', () => {
    const r = formatTraitValue(45.2, '%');
    assert.equal(r.display, '45.2 %');
  });

  it('formats ratio without unit suffix', () => {
    const r = formatTraitValue(0.87, 'ratio');
    assert.equal(r.display, '0.87');
    assert.equal(r.unit, '');
  });

  it('formats large values with thousands separator', () => {
    const r = formatTraitValue(7234, 'mm³');
    assert.equal(r.value, '7,234');
  });

  it('returns dash for null value', () => {
    const r = formatTraitValue(null, 'mg/dL');
    assert.equal(r.display, '—');
    assert.equal(r.unit, '');
  });

  it('returns dash for undefined value', () => {
    const r = formatTraitValue(undefined, 'kg');
    assert.equal(r.display, '—');
  });

  it('falls back to 2 decimals for unknown unit', () => {
    const r = formatTraitValue(3.14159, 'widgets');
    assert.equal(r.display, '3.14 widgets');
  });

  it('formats zero-decimal units correctly', () => {
    const r = formatTraitValue(120, 'mmHg');
    assert.equal(r.display, '120 mmHg');
  });

  it('formats beats/min as bpm', () => {
    const r = formatTraitValue(72, 'beats/min');
    assert.equal(r.display, '72 bpm');
  });
});
