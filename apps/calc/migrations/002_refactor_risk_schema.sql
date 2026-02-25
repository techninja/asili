-- Refactor risk storage: separate trait-level and PGS-level results
-- Eliminates JSON columns and enables proper SQL queries

-- Drop old table if exists
DROP TABLE IF EXISTS risk_scores;

-- Trait-level results (one row per individual-trait combination)
CREATE TABLE IF NOT EXISTS trait_results (
  individual_id VARCHAR NOT NULL,
  trait_id VARCHAR NOT NULL,
  best_pgs_id VARCHAR,
  best_pgs_performance DOUBLE,
  overall_z_score DOUBLE,
  overall_percentile DOUBLE,
  overall_confidence VARCHAR,
  total_matched_variants INTEGER,
  total_expected_variants INTEGER,
  trait_last_updated VARCHAR,
  calculated_at BIGINT,
  PRIMARY KEY (individual_id, trait_id)
);

-- PGS-level results (one row per individual-trait-PGS combination)
CREATE TABLE IF NOT EXISTS pgs_results (
  individual_id VARCHAR NOT NULL,
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  raw_score DOUBLE,
  z_score DOUBLE,
  percentile DOUBLE,
  matched_variants INTEGER,
  expected_variants INTEGER,
  confidence VARCHAR,
  insufficient_data BOOLEAN DEFAULT FALSE,
  performance_metric DOUBLE,
  positive_variants INTEGER,
  positive_sum DOUBLE,
  negative_variants INTEGER,
  negative_sum DOUBLE,
  PRIMARY KEY (individual_id, trait_id, pgs_id)
);

-- Top contributing variants per PGS (for detailed view)
CREATE TABLE IF NOT EXISTS pgs_top_variants (
  individual_id VARCHAR NOT NULL,
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  variant_id VARCHAR NOT NULL,
  effect_allele VARCHAR,
  effect_weight DOUBLE,
  user_genotype VARCHAR,
  chromosome VARCHAR,
  contribution DOUBLE,
  standardized_contribution DOUBLE,
  rank INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trait_results_individual ON trait_results(individual_id);
CREATE INDEX IF NOT EXISTS idx_trait_results_calculated ON trait_results(calculated_at);
CREATE INDEX IF NOT EXISTS idx_pgs_results_individual_trait ON pgs_results(individual_id, trait_id);
CREATE INDEX IF NOT EXISTS idx_pgs_results_pgs ON pgs_results(pgs_id);
CREATE INDEX IF NOT EXISTS idx_pgs_results_insufficient ON pgs_results(insufficient_data);
CREATE INDEX IF NOT EXISTS idx_pgs_top_variants_lookup ON pgs_top_variants(individual_id, trait_id, pgs_id);
