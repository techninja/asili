import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateAdapter } from '../src/data-layer/interface.js';
import { createMemoryAdapter } from './helpers/memory-adapter.js';

describe('browser adapter contract', () => {
  let adapter;
  beforeEach(() => { adapter = createMemoryAdapter(); });

  it('passes interface validation', () => {
    assert.equal(validateAdapter(adapter), true);
  });

  it('CRUD individuals', async () => {
    const ind = await adapter.addIndividual({ name: 'Alice', emoji: '👩' });
    assert.equal(ind.name, 'Alice');
    assert.equal(ind.emoji, '👩');
    assert.equal(ind.status, 'importing');

    const fetched = await adapter.getIndividual(ind.id);
    assert.equal(fetched.name, 'Alice');

    await adapter.updateIndividual(ind.id, { status: 'ready', variantCount: 700000 });
    const updated = await adapter.getIndividual(ind.id);
    assert.equal(updated.status, 'ready');
    assert.equal(updated.variantCount, 700000);

    const all = await adapter.getIndividuals();
    assert.equal(all.length, 1);

    await adapter.deleteIndividual(ind.id);
    assert.equal(await adapter.getIndividual(ind.id), null);
  });

  it('cascading delete removes variants and results', async () => {
    const ind = await adapter.addIndividual({ id: 'test1', name: 'Bob' });
    await adapter.storeVariants(ind.id, [{ rsid: 'rs1' }]);
    await adapter.saveRiskScore(ind.id, 'EFO_001', { zScore: 1.0 });
    await adapter.saveRiskScore(ind.id, 'EFO_002', { zScore: -0.5 });

    await adapter.deleteIndividual(ind.id);

    assert.equal(await adapter.getVariants(ind.id), null);
    assert.equal(await adapter.getRiskScore(ind.id, 'EFO_001'), null);
    assert.equal(await adapter.getRiskScore(ind.id, 'EFO_002'), null);
  });

  it('result key pattern is individualId:traitId', async () => {
    await adapter.saveRiskScore('person1', 'EFO_0004340', { zScore: 1.5 });
    const result = await adapter.getRiskScore('person1', 'EFO_0004340');
    assert.equal(result.zScore, 1.5);
    assert.equal(await adapter.getRiskScore('person1', 'EFO_OTHER'), null);
  });

  it('getAllResults returns only matching individual', async () => {
    await adapter.saveRiskScore('p1', 'T1', { z: 1 });
    await adapter.saveRiskScore('p1', 'T2', { z: 2 });
    await adapter.saveRiskScore('p2', 'T1', { z: 3 });

    const p1Results = await adapter.getAllResults('p1');
    assert.equal(p1Results.length, 2);

    const p2Results = await adapter.getAllResults('p2');
    assert.equal(p2Results.length, 1);
  });

  it('clearResults only clears target individual', async () => {
    await adapter.saveRiskScore('p1', 'T1', { z: 1 });
    await adapter.saveRiskScore('p2', 'T1', { z: 2 });

    await adapter.clearResults('p1');
    assert.equal(await adapter.getRiskScore('p1', 'T1'), null);
    assert.deepEqual(await adapter.getRiskScore('p2', 'T1'), { z: 2 });
  });

  it('updateIndividual throws for missing id', async () => {
    await assert.rejects(
      () => adapter.updateIndividual('nonexistent', { name: 'X' }),
      { message: /not found/i },
    );
  });

  it('storeVariants and getVariants round-trip', async () => {
    const variants = [{ rsid: 'rs1', chromosome: '1', position: 100 }];
    await adapter.storeVariants('p1', variants, { format: '23andMe' });
    const stored = await adapter.getVariants('p1');
    assert.equal(stored.variants.length, 1);
    assert.equal(stored.metadata.format, '23andMe');
  });
});
