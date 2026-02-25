import duckdb from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConnection } from './shared-db.js';
import { readFileSync } from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = path.join(__dirname, '../trait_overrides.json');

let traitOverrides = null;
function getOverrides() {
  if (!traitOverrides) {
    try {
      traitOverrides = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'));
    } catch {
      traitOverrides = {};
    }
  }
  return traitOverrides;
}

function calculateMetadataHash(override) {
  const metadata = {
    unit: override.unit || null,
    emoji: override.emoji || null,
    trait_type: override.trait_type || null,
    editorial_name: override.editorial_name || null,
    editorial_description: override.editorial_description || null,
    phenotype_mean: override.phenotype_mean || null,
    phenotype_sd: override.phenotype_sd || null,
    reference_population: override.reference_population || null
  };
  const str = JSON.stringify(metadata, Object.keys(metadata).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

class TraitMetadataDB {
  constructor() {
    this.initialized = false;
  }

  async getConnection() {
    return await getConnection();
  }

  async init() {
    if (this.initialized) return;
    const conn = await this.getConnection();
    await new Promise((resolve, reject) => {
      conn.run(`CREATE TABLE IF NOT EXISTS traits (
        trait_id VARCHAR PRIMARY KEY, 
        name VARCHAR NOT NULL, 
        description VARCHAR, 
        categories VARCHAR, 
        expected_variants BIGINT, 
        estimated_unique_variants BIGINT,
        unit VARCHAR,
        emoji VARCHAR,
        trait_type VARCHAR,
        editorial_name VARCHAR,
        editorial_description VARCHAR,
        phenotype_mean DOUBLE,
        phenotype_sd DOUBLE,
        reference_population VARCHAR,
        metadata_hash VARCHAR,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE TABLE IF NOT EXISTS trait_pgs (trait_id VARCHAR NOT NULL, pgs_id VARCHAR NOT NULL, performance_weight DOUBLE DEFAULT 0.5, PRIMARY KEY (trait_id, pgs_id))`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE TABLE IF NOT EXISTS trait_excluded_pgs (trait_id VARCHAR NOT NULL, pgs_id VARCHAR NOT NULL, reason VARCHAR NOT NULL, method VARCHAR, weight_type VARCHAR, PRIMARY KEY (trait_id, pgs_id))`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE INDEX IF NOT EXISTS idx_trait_pgs_trait ON trait_pgs(trait_id)`, err => err ? reject(err) : resolve());
    });
    // Also create pgs tables since they share the same DB
    await new Promise((resolve, reject) => {
      conn.run(`CREATE TABLE IF NOT EXISTS pgs_scores (pgs_id VARCHAR PRIMARY KEY, weight_type VARCHAR, method_name VARCHAR, norm_mean DOUBLE, norm_sd DOUBLE, variants_count BIGINT, last_updated TIMESTAMP DEFAULT now())`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE SEQUENCE IF NOT EXISTS pgs_performance_seq START 1`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE TABLE IF NOT EXISTS pgs_performance (id INTEGER PRIMARY KEY DEFAULT nextval('pgs_performance_seq'), pgs_id VARCHAR NOT NULL, metric_type VARCHAR NOT NULL, metric_value DOUBLE NOT NULL, ci_lower DOUBLE, ci_upper DOUBLE, sample_size BIGINT, ancestry VARCHAR)`, err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run(`CREATE INDEX IF NOT EXISTS idx_pgs_perf_id ON pgs_performance(pgs_id)`, err => err ? reject(err) : resolve());
    });
    this.initialized = true;
  }

  async upsertTrait(traitId, data) {
    await this.init();
    const conn = await this.getConnection();
    const now = new Date().toISOString();
    
    // Merge with overrides
    const overrides = getOverrides();
    const override = overrides[traitId] || {};
    
    const mergedData = {
      ...data,
      unit: override.unit || null,
      emoji: override.emoji || null,
      trait_type: override.trait_type || null,
      editorial_name: override.editorial_name || null,
      editorial_description: override.editorial_description || null,
      phenotype_mean: override.phenotype_mean || null,
      phenotype_sd: override.phenotype_sd || null,
      reference_population: override.reference_population || null,
      metadata_hash: calculateMetadataHash(override)
    };
    
    return new Promise((resolve, reject) => {
      const stmt = conn.prepare(`
        INSERT INTO traits (
          trait_id, name, description, categories, 
          expected_variants, estimated_unique_variants,
          unit, emoji, trait_type, editorial_name, editorial_description,
          phenotype_mean, phenotype_sd, reference_population, metadata_hash,
          last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON CONFLICT (trait_id) DO UPDATE SET 
          name=EXCLUDED.name, 
          description=EXCLUDED.description, 
          categories=EXCLUDED.categories, 
          expected_variants=EXCLUDED.expected_variants, 
          estimated_unique_variants=EXCLUDED.estimated_unique_variants,
          unit=EXCLUDED.unit,
          emoji=EXCLUDED.emoji,
          trait_type=EXCLUDED.trait_type,
          editorial_name=EXCLUDED.editorial_name,
          editorial_description=EXCLUDED.editorial_description,
          phenotype_mean=EXCLUDED.phenotype_mean,
          phenotype_sd=EXCLUDED.phenotype_sd,
          reference_population=EXCLUDED.reference_population,
          metadata_hash=EXCLUDED.metadata_hash,
          last_updated=EXCLUDED.last_updated
      `);
      stmt.run(
        traitId, 
        data.name, 
        data.description ?? null, 
        data.categories ?? '', 
        data.expected_variants ?? null, 
        data.estimated_unique_variants ?? null,
        mergedData.unit,
        mergedData.emoji,
        mergedData.trait_type,
        mergedData.editorial_name,
        mergedData.editorial_description,
        mergedData.phenotype_mean,
        mergedData.phenotype_sd,
        mergedData.reference_population,
        mergedData.metadata_hash,
        now, 
        err => {
          stmt.finalize();
          err ? reject(err) : resolve();
        }
      );
    });
  }

  async getAllTraits() {
    await this.init();
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.all('SELECT * FROM traits ORDER BY name', (err, rows) => err ? reject(err) : resolve(rows));
    });
  }

  async addTraitPGS(traitId, pgsId, performanceWeight = 0.5) {
    await this.init();
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      const stmt = conn.prepare(`INSERT INTO trait_pgs VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET performance_weight=EXCLUDED.performance_weight`);
      stmt.run(traitId, pgsId, performanceWeight, err => {
        stmt.finalize();
        err ? reject(err) : resolve();
      });
    });
  }

  async addExcludedPGS(traitId, pgsId, reason, method, weightType) {
    await this.init();
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      const stmt = conn.prepare(`INSERT INTO trait_excluded_pgs VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET reason=EXCLUDED.reason`);
      stmt.run(traitId, pgsId, reason, method ?? null, weightType ?? null, err => {
        stmt.finalize();
        err ? reject(err) : resolve();
      });
    });
  }

  async getTraitPGS(traitId) {
    await this.init();
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.all('SELECT pgs_id, performance_weight FROM trait_pgs WHERE trait_id = ?', [traitId], (err, rows) => err ? reject(err) : resolve(rows));
    });
  }

  async getExcludedPGS(traitId) {
    await this.init();
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.all('SELECT * FROM trait_excluded_pgs WHERE trait_id = ?', [traitId], (err, rows) => err ? reject(err) : resolve(rows));
    });
  }

  async deleteTrait(traitId) {
    await this.init();
    const conn = await this.getConnection();
    await new Promise((resolve, reject) => {
      conn.run('DELETE FROM trait_pgs WHERE trait_id = ?', [traitId], err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run('DELETE FROM trait_excluded_pgs WHERE trait_id = ?', [traitId], err => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      conn.run('DELETE FROM traits WHERE trait_id = ?', [traitId], err => err ? reject(err) : resolve());
    });
  }

  async close() {
    // Don't close - shared connection is managed by shared-db.js
  }
}

const traitDB = new TraitMetadataDB();

export async function upsertTrait(traitId, data) {
  return traitDB.upsertTrait(traitId, data);
}

export async function getAllTraits() {
  return traitDB.getAllTraits();
}

export async function addTraitPGS(traitId, pgsId, performanceWeight) {
  return traitDB.addTraitPGS(traitId, pgsId, performanceWeight);
}

export async function addExcludedPGS(traitId, pgsId, reason, method, weightType) {
  return traitDB.addExcludedPGS(traitId, pgsId, reason, method, weightType);
}

export async function getTraitPGS(traitId) {
  return traitDB.getTraitPGS(traitId);
}

export async function getExcludedPGS(traitId) {
  return traitDB.getExcludedPGS(traitId);
}

export async function deleteTrait(traitId) {
  return traitDB.deleteTrait(traitId);
}
