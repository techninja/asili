/**
 * PGS score metadata database operations.
 * Stores per-PGS normalization params and validation metrics.
 */
import { getDb } from './shared-db.js';
import { runMigrations } from './migrate.js';

/**
 *
 */
function init() {
  runMigrations();
}

/**
 *
 */
export function upsertPGS(pgsId, data) {
  init();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO pgs_scores (pgs_id, weight_type, method_name, norm_mean, norm_sd, variants_number, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (pgs_id) DO UPDATE SET
         weight_type=COALESCE(excluded.weight_type, pgs_scores.weight_type),
         method_name=COALESCE(excluded.method_name, pgs_scores.method_name),
         norm_mean=COALESCE(excluded.norm_mean, pgs_scores.norm_mean),
         norm_sd=COALESCE(excluded.norm_sd, pgs_scores.norm_sd),
         variants_number=COALESCE(excluded.variants_number, pgs_scores.variants_number),
         last_updated=excluded.last_updated`,
    )
    .run(
      pgsId,
      data.weight_type ?? null,
      data.method ?? null,
      data.norm_mean ?? null,
      data.norm_sd ?? null,
      data.variants_number ?? null,
      now,
    );
}

/**
 *
 */
export function upsertPerformanceMetrics(pgsId, metrics) {
  init();
  const db = getDb();
  db.prepare('DELETE FROM pgs_performance WHERE pgs_id = ?').run(pgsId);
  if (!metrics?.all_metrics?.length) return;

  const stmt = db.prepare(
    `INSERT INTO pgs_performance (pgs_id, metric_type, metric_value, ci_lower, ci_upper, sample_size, ancestry)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const m of metrics.all_metrics) {
    stmt.run(
      pgsId, m.type, m.value,
      m.ci_lower ?? null, m.ci_upper ?? null,
      m.sample_size ?? null, m.ancestry ?? null,
    );
  }
}

/**
 *
 */
export function getPGS(pgsId) {
  init();
  return getDb()
    .prepare('SELECT * FROM pgs_scores WHERE pgs_id = ?')
    .get(pgsId);
}

/**
 *
 */
export function getBestMetric(pgsId) {
  init();
  const rows = getDb()
    .prepare('SELECT * FROM pgs_performance WHERE pgs_id = ? ORDER BY metric_value DESC')
    .all(pgsId);

  const rank = { 'C-index': 4, 'R²': 3, AUROC: 3, AUC: 3, OR: 1, HR: 1, 'β': 1 };
  return rows.reduce((best, m) => {
    const mr = rank[m.metric_type] || 0;
    const br = best ? rank[best.metric_type] || 0 : 0;
    return mr > br || (mr === br && m.metric_value > (best?.metric_value || 0))
      ? m : best;
  }, null);
}
