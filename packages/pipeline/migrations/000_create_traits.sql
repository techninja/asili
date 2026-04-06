-- Core trait information
CREATE TABLE IF NOT EXISTS traits (
  trait_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  categories TEXT,
  unit TEXT,
  emoji TEXT,
  trait_type TEXT,
  editorial_name TEXT,
  editorial_description TEXT,
  phenotype_mean REAL,
  phenotype_sd REAL,
  reference_population TEXT,
  expected_variants INTEGER,
  estimated_unique_variants INTEGER,
  metadata_hash TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- PGS metadata (centralized, deduplicated)
CREATE TABLE IF NOT EXISTS pgs_scores (
  pgs_id TEXT PRIMARY KEY,
  weight_type TEXT,
  method_name TEXT,
  norm_mean REAL,
  norm_sd REAL,
  variants_number INTEGER,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Performance metrics (one row per metric)
CREATE TABLE IF NOT EXISTS pgs_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pgs_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  ci_lower REAL,
  ci_upper REAL,
  sample_size INTEGER,
  ancestry TEXT
);

-- Trait → PGS associations
CREATE TABLE IF NOT EXISTS trait_pgs (
  trait_id TEXT NOT NULL,
  pgs_id TEXT NOT NULL,
  performance_weight REAL DEFAULT 0.5,
  PRIMARY KEY (trait_id, pgs_id)
);

-- Excluded PGS with reasons
CREATE TABLE IF NOT EXISTS trait_excluded_pgs (
  trait_id TEXT NOT NULL,
  pgs_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  method TEXT,
  weight_type TEXT,
  PRIMARY KEY (trait_id, pgs_id)
);

CREATE INDEX IF NOT EXISTS idx_pgs_perf_id ON pgs_performance(pgs_id);
CREATE INDEX IF NOT EXISTS idx_trait_pgs_trait ON trait_pgs(trait_id);
CREATE INDEX IF NOT EXISTS idx_trait_pgs_pgs ON trait_pgs(pgs_id);
