/**
 * Trait catalog database operations.
 * Merges PGS Catalog data with editorial overrides on upsert.
 */
import { getDb } from './shared-db.js';
import { runMigrations } from './migrate.js';
import { getOverrideFields, reloadOverrides as _reload } from './overrides.js';

/**
 *
 */
function init() {
  runMigrations();
}

/**
 *
 */
export function upsertTrait(traitId, data) {
  init();
  const db = getDb();
  const o = getOverrideFields(traitId);
  const now = new Date().toISOString();

  db.prepare(`INSERT INTO traits (
      trait_id, name, description, categories,
      expected_variants, estimated_unique_variants,
      unit, emoji, trait_type, editorial_name, editorial_description,
      phenotype_mean, phenotype_sd, reference_population,
      metadata_hash, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (trait_id) DO UPDATE SET
      name=excluded.name,
      description=COALESCE(excluded.description, traits.description),
      categories=COALESCE(excluded.categories, traits.categories),
      expected_variants=COALESCE(excluded.expected_variants, traits.expected_variants),
      estimated_unique_variants=COALESCE(excluded.estimated_unique_variants, traits.estimated_unique_variants),
      unit=COALESCE(excluded.unit, traits.unit),
      emoji=COALESCE(excluded.emoji, traits.emoji),
      trait_type=COALESCE(excluded.trait_type, traits.trait_type),
      editorial_name=COALESCE(excluded.editorial_name, traits.editorial_name),
      editorial_description=COALESCE(excluded.editorial_description, traits.editorial_description),
      phenotype_mean=COALESCE(excluded.phenotype_mean, traits.phenotype_mean),
      phenotype_sd=COALESCE(excluded.phenotype_sd, traits.phenotype_sd),
      reference_population=COALESCE(excluded.reference_population, traits.reference_population),
      metadata_hash=excluded.metadata_hash,
      last_updated=excluded.last_updated
  `).run(
    traitId, data.name, data.description ?? null, data.categories ?? '',
    data.expected_variants ?? null, data.estimated_unique_variants ?? null,
    o.unit, o.emoji, o.trait_type, o.editorial_name, o.editorial_description,
    o.phenotype_mean, o.phenotype_sd, o.reference_population,
    o.metadata_hash, now,
  );
}

/**
 *
 */
export function getAllTraits() {
  init();
  return getDb().prepare('SELECT * FROM traits ORDER BY name').all();
}

/**
 *
 */
export function addTraitPGS(traitId, pgsId, performanceWeight = 0.5) {
  init();
  getDb()
    .prepare(
      `INSERT INTO trait_pgs VALUES (?, ?, ?)
       ON CONFLICT DO UPDATE SET performance_weight=excluded.performance_weight`,
    )
    .run(traitId, pgsId, performanceWeight);
}

/**
 *
 */
export function getTraitPGS(traitId) {
  init();
  return getDb()
    .prepare('SELECT pgs_id, performance_weight FROM trait_pgs WHERE trait_id = ?')
    .all(traitId);
}

/**
 *
 */
export function addExcludedPGS(traitId, pgsId, reason, method, weightType) {
  init();
  getDb()
    .prepare(
      `INSERT INTO trait_excluded_pgs VALUES (?, ?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET reason=excluded.reason`,
    )
    .run(traitId, pgsId, reason, method ?? null, weightType ?? null);
}

/**
 *
 */
export function deleteTrait(traitId) {
  init();
  const db = getDb();
  db.prepare('DELETE FROM trait_pgs WHERE trait_id = ?').run(traitId);
  db.prepare('DELETE FROM trait_excluded_pgs WHERE trait_id = ?').run(traitId);
  db.prepare('DELETE FROM traits WHERE trait_id = ?').run(traitId);
}

/**
 *
 */
export function getExistingTraitIds() {
  init();
  const rows = getDb().prepare('SELECT DISTINCT trait_id FROM trait_pgs').all();
  return new Set(rows.map(r => r.trait_id));
}

/**
 *
 */
export function clearTraitPGS(traitId) {
  init();
  const db = getDb();
  db.prepare('DELETE FROM trait_pgs WHERE trait_id = ?').run(traitId);
  db.prepare('DELETE FROM trait_excluded_pgs WHERE trait_id = ?').run(traitId);
}

/**
 *
 */
export function reloadOverrides() {
  _reload();
}
