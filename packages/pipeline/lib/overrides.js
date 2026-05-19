/**
 * Editorial override loading and metadata hashing.
 * Reads trait_overrides.json and computes deterministic hashes for change detection.
 */
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = join(__dirname, '..', 'trait_overrides.json');

let overrides = null;

/**
 *
 */
export function getOverrides() {
  if (!overrides) {
    try {
      overrides = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'));
    } catch {
      overrides = {};
    }
  }
  return overrides;
}

/**
 *
 */
export function reloadOverrides() {
  overrides = null;
}

/** Deterministic hash of editorial fields for change detection. */
export function metadataHash(o) {
  const fields = {
    unit: o.unit ?? null,
    emoji: o.emoji ?? null,
    trait_type: o.trait_type ?? null,
    editorial_name: o.editorial_name ?? null,
    editorial_description: o.editorial_description ?? null,
    phenotype_mean: o.phenotype_mean ?? null,
    phenotype_sd: o.phenotype_sd ?? null,
    reference_population: o.reference_population ?? null,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(fields, Object.keys(fields).sort()))
    .digest('hex');
}

/**
 * Merge override fields for a trait.
 * @param {string} traitId
 * @returns {{ unit, emoji, trait_type, editorial_name, editorial_description, phenotype_mean, phenotype_sd, reference_population, metadata_hash: string }}
 */
export function getOverrideFields(traitId) {
  const o = getOverrides()[traitId] || {};
  return {
    unit: o.unit ?? null,
    emoji: o.emoji ?? null,
    trait_type: o.trait_type ?? null,
    editorial_name: o.editorial_name ?? null,
    editorial_description: o.editorial_description ?? null,
    phenotype_mean: o.phenotype_mean ?? null,
    phenotype_sd: o.phenotype_sd ?? null,
    reference_population: o.reference_population ?? null,
    metadata_hash: metadataHash(o),
  };
}
