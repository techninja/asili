import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOverrides, getOverrideFields, metadataHash } from '../lib/overrides.js';
import { loadAllowlist } from '../lib/catalog.js';

describe('overrides', () => {
  it('loads trait_overrides.json', () => {
    const o = getOverrides();
    assert.ok(typeof o === 'object');
    assert.ok('EFO_0004340' in o, 'BMI should be in overrides');
  });

  it('returns override fields for known trait', () => {
    const fields = getOverrideFields('EFO_0004340');
    assert.equal(fields.editorial_name, 'body mass index');
    assert.equal(fields.unit, 'BMI');
    assert.equal(fields.trait_type, 'quantitative');
    assert.ok(fields.metadata_hash.length > 0);
  });

  it('returns nulls for unknown trait', () => {
    const fields = getOverrideFields('FAKE_0000000');
    assert.equal(fields.editorial_name, null);
    assert.equal(fields.unit, null);
    assert.ok(fields.metadata_hash.length > 0);
  });

  it('produces stable hashes', () => {
    const h1 = metadataHash({ emoji: '📊', unit: 'BMI' });
    const h2 = metadataHash({ emoji: '📊', unit: 'BMI' });
    assert.equal(h1, h2);
  });

  it('all 44 tier1 traits have overrides', () => {
    const overrides = getOverrides();
    const allowlist = loadAllowlist('tier1_public');
    assert.ok(allowlist, 'tier1_public allowlist should exist');
    for (const id of allowlist) {
      assert.ok(id in overrides, `Missing override for ${id}`);
      assert.equal(overrides[id].trait_type, 'quantitative', `${id} should be quantitative`);
    }
  });
});

describe('catalog', () => {
  it('loads tier1_public allowlist as Set', () => {
    const list = loadAllowlist('tier1_public');
    assert.ok(list instanceof Set);
    assert.equal(list.size, 44);
    assert.ok(list.has('EFO_0004340'));
  });

  it('returns null for tier2_researcher (wildcard)', () => {
    const list = loadAllowlist('tier2_researcher');
    assert.equal(list, null);
  });

  it('returns null for missing tier', () => {
    const list = loadAllowlist('nonexistent_tier');
    assert.equal(list, null);
  });

  it('returns null for local/empty tier', () => {
    assert.equal(loadAllowlist(null), null);
    assert.equal(loadAllowlist('local'), null);
  });
});
