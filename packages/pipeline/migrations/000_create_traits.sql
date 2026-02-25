-- Trait catalog with normalized PGS metadata (no JSON columns)

-- Core trait information
CREATE TABLE IF NOT EXISTS traits (
  trait_id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description VARCHAR,
  categories VARCHAR NOT NULL,
  canonical_uri VARCHAR,
  expected_variants BIGINT,
  estimated_unique_variants BIGINT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PGS metadata (centralized, deduplicated)
CREATE TABLE IF NOT EXISTS pgs_scores (
  pgs_id VARCHAR PRIMARY KEY,
  weight_type VARCHAR,
  method_name VARCHAR,
  norm_mean DOUBLE,
  norm_sd DOUBLE,
  variants_count BIGINT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics (one row per metric)
CREATE SEQUENCE IF NOT EXISTS pgs_performance_seq START 1;
CREATE TABLE IF NOT EXISTS pgs_performance (
  id INTEGER PRIMARY KEY DEFAULT nextval('pgs_performance_seq'),
  pgs_id VARCHAR NOT NULL,
  metric_type VARCHAR NOT NULL,
  metric_value DOUBLE NOT NULL,
  ci_lower DOUBLE,
  ci_upper DOUBLE,
  sample_size BIGINT,
  ancestry VARCHAR
);

-- Trait → PGS associations
CREATE TABLE IF NOT EXISTS trait_pgs (
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  performance_weight DOUBLE DEFAULT 0.5,
  PRIMARY KEY (trait_id, pgs_id)
);

-- Excluded PGS with reasons
CREATE TABLE IF NOT EXISTS trait_excluded_pgs (
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  reason VARCHAR NOT NULL,
  method VARCHAR,
  weight_type VARCHAR,
  PRIMARY KEY (trait_id, pgs_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pgs_perf_id ON pgs_performance(pgs_id);
CREATE INDEX IF NOT EXISTS idx_trait_pgs_trait ON trait_pgs(trait_id);
CREATE INDEX IF NOT EXISTS idx_trait_pgs_pgs ON trait_pgs(pgs_id);
