import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'fs';

process.env.OUTPUT_DIR = '/tmp';

const { getDb, closeDb } = await import('../lib/shared-db.js');
const { runMigrations } = await import('../lib/migrate.js');
const traitDB = await import('../lib/trait-db.js');
const pgsDB = await import('../lib/pgs-db.js');

runMigrations();

after(() => {
  closeDb();
  for (const f of ['trait_manifest.db', 'trait_manifest.db-wal', 'trait_manifest.db-shm']) {
    try { unlinkSync(`/tmp/${f}`); } catch { /* ok */ }
  }
});

describe('trait-db', () => {
  it('upserts and retrieves a trait', () => {
    traitDB.upsertTrait('EFO_TEST', { name: 'test trait', description: 'desc' });
    const all = traitDB.getAllTraits();
    assert.ok(all.some(t => t.trait_id === 'EFO_TEST'));
  });

  it('adds and retrieves trait PGS', () => {
    traitDB.addTraitPGS('EFO_TEST', 'PGS000001', 0.8);
    const pgs = traitDB.getTraitPGS('EFO_TEST');
    assert.equal(pgs.length, 1);
    assert.equal(pgs[0].pgs_id, 'PGS000001');
    assert.equal(pgs[0].performance_weight, 0.8);
  });

  it('tracks existing trait IDs', () => {
    const ids = traitDB.getExistingTraitIds();
    assert.ok(ids.has('EFO_TEST'));
    assert.ok(!ids.has('EFO_MISSING'));
  });

  it('adds excluded PGS', () => {
    traitDB.addExcludedPGS('EFO_TEST', 'PGS000002', 'Too few variants', null, null);
    const row = getDb()
      .prepare('SELECT * FROM trait_excluded_pgs WHERE pgs_id = ?')
      .get('PGS000002');
    assert.equal(row.reason, 'Too few variants');
  });

  it('clears trait PGS data', () => {
    traitDB.clearTraitPGS('EFO_TEST');
    assert.equal(traitDB.getTraitPGS('EFO_TEST').length, 0);
  });

  it('deletes a trait completely', () => {
    traitDB.deleteTrait('EFO_TEST');
    assert.ok(!traitDB.getAllTraits().some(t => t.trait_id === 'EFO_TEST'));
  });
});

describe('pgs-db', () => {
  it('upserts and retrieves PGS metadata', () => {
    pgsDB.upsertPGS('PGS000099', {
      weight_type: 'beta', method: 'LDpred',
      norm_mean: 0.5, norm_sd: 0.1, variants_number: 1000,
    });
    const row = pgsDB.getPGS('PGS000099');
    assert.equal(row.weight_type, 'beta');
    assert.equal(row.variants_number, 1000);
  });

  it('upserts and ranks performance metrics', () => {
    pgsDB.upsertPerformanceMetrics('PGS000099', {
      all_metrics: [
        { type: 'R²', value: 0.12, ci_lower: 0.08, ci_upper: 0.16 },
        { type: 'AUROC', value: 0.65 },
      ],
    });
    const best = pgsDB.getBestMetric('PGS000099');
    assert.ok(best);
    // Same rank (3), AUROC 0.65 > R² 0.12 → AUROC wins
    assert.equal(best.metric_type, 'AUROC');
  });
});
