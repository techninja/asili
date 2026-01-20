/**
 * Centralized path constants for Asili
 */

// Detect if running in Docker or local development
const isNode = typeof process !== 'undefined';
const isDocker = isNode && (process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true');
const baseDir = isNode ? (isDocker ? '/app' : process.cwd().replace(/\/apps\/[^/]+$/, '')) : '/app';

export const PATHS = {
  // Data directories
  DATA_OUT: `${baseDir}/data_out`,
  SERVER_DATA: `${baseDir}/server-data`,

  // Trait data
  TRAIT_PACKS_DIR: `${baseDir}/data_out/packs`,
  TRAIT_MANIFEST: `${baseDir}/data_out/trait_manifest.json`,
  TRAIT_MANIFEST_DB: `${baseDir}/data_out/trait_manifest.db`,

  // Cache and results
  RISK_SCORES_DB: `${baseDir}/data_out/risk_scores.db`,

  // Web paths (served via HTTP)
  WEB_DATA: '/data',
  WEB_RISK_SCORES: '/data/risk_scores.db',
  WEB_TRAIT_MANIFEST: '/data/trait_manifest.json',
  WEB_TRAIT_MANIFEST_DB: '/data/trait_manifest.db',

  // Trait file pattern
  getTraitFile: (traitId) => `${baseDir}/data_out/packs/${traitId.replace(/:/g, '_')}_hg38.parquet`,
  getWebTraitFile: (traitId) => `/data/packs/${traitId.replace(/:/g, '_')}_hg38.parquet`
};