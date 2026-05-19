import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAdapter } from '../src/data-layer/interface.js';

describe('validateAdapter', () => {
  it('returns true for a complete adapter', () => {
    const adapter = {
      initialize: () => {}, getStatus: () => {},
      getIndividuals: () => {}, getIndividual: () => {},
      addIndividual: () => {}, updateIndividual: () => {},
      deleteIndividual: () => {},
      getRiskScore: () => {}, getAllResults: () => {},
      saveRiskScore: () => {}, clearResults: () => {},
      getTraitManifest: () => {},
      storeVariants: () => {}, getVariants: () => {},
      deleteVariants: () => {},
    };
    assert.equal(validateAdapter(adapter), true);
  });

  it('returns false for missing methods', () => {
    assert.equal(validateAdapter({}), false);
    assert.equal(validateAdapter({ initialize: () => {} }), false);
  });

  it('returns false for non-function properties', () => {
    const adapter = {
      initialize: 'not a function', getStatus: () => {},
      getIndividuals: () => {}, getIndividual: () => {},
      addIndividual: () => {}, updateIndividual: () => {},
      deleteIndividual: () => {},
      getRiskScore: () => {}, getAllResults: () => {},
      saveRiskScore: () => {}, clearResults: () => {},
      getTraitManifest: () => {},
      storeVariants: () => {}, getVariants: () => {},
      deleteVariants: () => {},
    };
    assert.equal(validateAdapter(adapter), false);
  });
});
