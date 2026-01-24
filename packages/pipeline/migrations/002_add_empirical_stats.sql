-- Add empirical_stats column for storing population-level PGS distributions
-- Computed from 1000 Genomes Project reference data

ALTER TABLE traits ADD COLUMN IF NOT EXISTS empirical_stats VARCHAR;
