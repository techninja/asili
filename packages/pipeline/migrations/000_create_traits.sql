-- Migration: Create traits table for manifest metadata
-- Stores trait information, PGS associations, and empirical statistics

CREATE TABLE IF NOT EXISTS traits (
  mondo_id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description VARCHAR,
  categories VARCHAR NOT NULL,
  variant_count BIGINT,
  file_path VARCHAR,
  pgs_ids VARCHAR,
  pgs_metadata VARCHAR,
  source_hashes VARCHAR,
  last_updated VARCHAR,
  actual_variants BIGINT,
  file_size_mb DOUBLE,
  last_processed VARCHAR,
  expected_variants BIGINT,
  weight DOUBLE,
  last_validated VARCHAR,
  canonical_uri VARCHAR,
  excluded_pgs VARCHAR
);
