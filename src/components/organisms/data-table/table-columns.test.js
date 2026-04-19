import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fmtNum } from './table-columns.js';

describe('fmtNum', () => {
  it('returns — for null/undefined', () => {
    assert.equal(fmtNum(null), '—');
    assert.equal(fmtNum(undefined), '—');
  });

  it('formats millions', () => {
    assert.equal(fmtNum(1234567), '1.2m');
    assert.equal(fmtNum(103500000), '103.5m');
  });

  it('formats thousands (≥10k)', () => {
    assert.equal(fmtNum(65400), '65.4k');
    assert.equal(fmtNum(10000), '10.0k');
  });

  it('formats with commas (1k–9.9k)', () => {
    assert.equal(fmtNum(1234), '1,234');
    assert.equal(fmtNum(9999), '9,999');
  });

  it('returns plain string for small numbers', () => {
    assert.equal(fmtNum(42), '42');
    assert.equal(fmtNum(0), '0');
  });
});
