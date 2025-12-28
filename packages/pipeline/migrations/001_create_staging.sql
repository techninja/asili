-- Migration: Create staging table for streaming PGS data
-- This allows us to stream data directly into DuckDB without Node.js memory limits

CREATE TABLE IF NOT EXISTS pgs_staging (
    variant_id VARCHAR,
    chr_name VARCHAR,
    chr_position BIGINT,
    effect_allele VARCHAR,
    other_allele VARCHAR,
    effect_weight DOUBLE,
    pgs_id VARCHAR,
    source_family VARCHAR,
    source_type VARCHAR,
    source_subtype VARCHAR,
    source_weight DOUBLE,
    weight_type VARCHAR,
    format_type VARCHAR
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pgs_staging_variant ON pgs_staging(variant_id);
CREATE INDEX IF NOT EXISTS idx_pgs_staging_pgs ON pgs_staging(pgs_id);