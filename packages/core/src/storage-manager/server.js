/**
 * Server-side storage manager using DuckDB
 * Provides persistent storage for genomic data and results
 */

import { StorageManager } from '../interfaces/genomic.js';
import { Debug } from '../utils/debug.js';
import { promises as fs } from 'fs';
import path from 'path';
import { PATHS } from '../constants/paths.js';

export class ServerStorageManager extends StorageManager {
  constructor(config = {}) {
    super(config);
    this.dataDir = config.dataDir || './server-data';
    this.cacheDir = config.cacheDir || path.join(this.dataDir, 'cache');
    this.db = null;
    this.conn = null;
  }

  async initialize() {
    if (this.db) return;

    try {
      // Dynamic import for DuckDB
      const duckdb = await import('duckdb');
      
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'variants'), { recursive: true });
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Initialize DuckDB database - use persistent file for server storage
      const dbPath = path.join(this.dataDir, 'asili-server.duckdb');
      this.db = new duckdb.default.Database(dbPath);
      this.conn = this.db.connect();

      // Create tables (will be ignored if they already exist)
      await this._createTables();
      
      Debug.log(1, 'ServerStorageManager', `Initialized with data directory: ${this.dataDir}`);
      
    } catch (error) {
      throw new Error(`Failed to initialize server storage: ${error.message}`);
    }
  }

  async _createTables() {
    const queries = [
      // Core key-value storage
      `CREATE TABLE IF NOT EXISTS data (
        key TEXT PRIMARY KEY,
        data TEXT,
        timestamp INTEGER
      )`,
      
      // Individual management
      `CREATE TABLE IF NOT EXISTS individuals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        relationship TEXT DEFAULT 'self',
        emoji TEXT DEFAULT '👤',
        status TEXT DEFAULT 'importing',
        created_at BIGINT,
        updated_at BIGINT
      )`,
      
      // DNA variants metadata (actual variants stored as files)
      `CREATE TABLE IF NOT EXISTS variant_files (
        individual_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        variant_count INTEGER,
        file_size INTEGER,
        created_at BIGINT
      )`,
      
      // Risk scores cache
      `CREATE TABLE IF NOT EXISTS risk_scores (
        trait_id TEXT,
        individual_id TEXT,
        risk_score REAL,
        pgs_breakdown TEXT,
        pgs_details TEXT,
        matched_variants INTEGER,
        total_variants INTEGER,
        trait_last_updated TEXT,
        calculated_at BIGINT,
        PRIMARY KEY (trait_id, individual_id)
      )`,
      
      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_individuals_status ON individuals(status)`,
      `CREATE INDEX IF NOT EXISTS idx_risk_scores_individual ON risk_scores(individual_id)`,
      `CREATE INDEX IF NOT EXISTS idx_risk_scores_calculated ON risk_scores(calculated_at)`
    ];

    for (const query of queries) {
      await this._runQuery(query);
    }
  }

  async _runQuery(sql, params = []) {
    // DuckDB doesn't handle prepared statements the same way, use direct SQL
    let finalSql = sql;
    if (params.length > 0) {
      params.forEach((param, index) => {
        const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
        finalSql = finalSql.replace('?', value);
      });
    }
    
    Debug.log(3, 'ServerStorageManager', 'Executing SQL:', finalSql);
    
    return new Promise((resolve, reject) => {
      this.conn.exec(finalSql, (err, result) => {
        if (err) {
          Debug.log(1, 'ServerStorageManager', 'SQL Error:', err.message);
          reject(err);
        } else {
          Debug.log(3, 'ServerStorageManager', 'SQL Success, result type:', typeof result);
          resolve(result);
        }
      });
    });
  }

  async _getQuery(sql, params = []) {
    let finalSql = sql;
    if (params.length > 0) {
      params.forEach((param, index) => {
        const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
        finalSql = finalSql.replace('?', value);
      });
    }
    
    Debug.log(3, 'ServerStorageManager', 'Executing GET query:', finalSql);
    
    return new Promise((resolve, reject) => {
      this.conn.all(finalSql, (err, result) => {
        if (err) {
          Debug.log(1, 'ServerStorageManager', 'GET Query Error:', err.message);
          reject(err);
        } else {
          const row = result?.[0] || null;
          if (row) {
            Debug.log(3, 'ServerStorageManager', 'GET Query result row keys:', Object.keys(row));
            Debug.log(3, 'ServerStorageManager', 'GET Query result row types:', Object.entries(row).map(([k, v]) => `${k}: ${typeof v}`).join(', '));
          }
          resolve(row);
        }
      });
    });
  }

  async _allQuery(sql, params = []) {
    let finalSql = sql;
    if (params.length > 0) {
      params.forEach((param, index) => {
        const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
        finalSql = finalSql.replace('?', value);
      });
    }
    
    Debug.log(3, 'ServerStorageManager', 'Executing ALL query:', finalSql);
    
    return new Promise((resolve, reject) => {
      this.conn.all(finalSql, (err, result) => {
        if (err) {
          Debug.log(1, 'ServerStorageManager', 'ALL Query Error:', err.message);
          reject(err);
        } else {
          if (result && result.length > 0) {
            Debug.log(3, 'ServerStorageManager', `ALL Query returned ${result.length} rows`);
            Debug.log(3, 'ServerStorageManager', 'First row types:', Object.entries(result[0]).map(([k, v]) => `${k}: ${typeof v}`).join(', '));
          }
          resolve(result || []);
        }
      });
    });
  }

  // Core storage interface
  async store(key, data) {
    await this.initialize();
    
    const serialized = JSON.stringify(data);
    await this._runQuery(
      'INSERT OR REPLACE INTO data (key, data, timestamp) VALUES (?, ?, ?)',
      [key, serialized, Date.now()]
    );
  }

  async retrieve(key) {
    await this.initialize();
    
    const row = await this._getQuery(
      'SELECT data FROM data WHERE key = ?',
      [key]
    );
    
    return row ? JSON.parse(row.data) : null;
  }

  async list() {
    await this.initialize();
    
    const rows = await this._allQuery('SELECT key FROM data');
    return rows.map(row => row.key);
  }

  async delete(key) {
    await this.initialize();
    
    await this._runQuery('DELETE FROM data WHERE key = ?', [key]);
  }

  async clear() {
    await this.initialize();
    
    await this._runQuery('DELETE FROM data');
  }

  // Individual management
  async addIndividual(id, name, relationship = 'self', emoji = '👤') {
    await this.initialize();
    
    const now = Date.now();
    await this._runQuery(
      `INSERT OR REPLACE INTO individuals 
       (id, name, relationship, emoji, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, 'importing', ?, ?)`,
      [id, name, relationship, emoji, now, now]
    );

    return { id, name, relationship, emoji, status: 'importing', createdAt: now };
  }

  async updateIndividual(id, updates) {
    await this.initialize();
    
    const current = await this._getQuery(
      'SELECT * FROM individuals WHERE id = ?',
      [id]
    );
    
    if (!current) {
      throw new Error('Individual not found');
    }

    const fields = [];
    const values = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    
    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);
      
      await this._runQuery(
        `UPDATE individuals SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }

    return await this._getQuery('SELECT * FROM individuals WHERE id = ?', [id]);
  }

  async getIndividuals() {
    await this.initialize();
    
    return await this._allQuery('SELECT * FROM individuals ORDER BY created_at DESC');
  }

  async getIndividual(id) {
    await this.initialize();
    
    return await this._getQuery('SELECT * FROM individuals WHERE id = ?', [id]);
  }

  // DNA variant storage (file-based for efficiency)
  async storeVariants(individualId, variants, progressCallback) {
    await this.initialize();
    
    Debug.log(1, 'ServerStorageManager', `Storing ${variants.length} variants for individual: ${individualId}`);
    
    const variantFile = path.join(this.dataDir, 'variants', `${individualId}.json`);
    
    // Store variants as JSON file for efficient access
    const variantData = {
      individualId,
      variants,
      metadata: {
        count: variants.length,
        storedAt: Date.now()
      }
    };
    
    await fs.writeFile(variantFile, JSON.stringify(variantData));
    
    // Update metadata in database
    await this._runQuery(
      `INSERT OR REPLACE INTO variant_files 
       (individual_id, file_path, variant_count, file_size, created_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        individualId,
        variantFile,
        variants.length,
        (await fs.stat(variantFile)).size,
        Date.now()
      ]
    );

    progressCallback?.(variants.length, variants.length);
    
    Debug.log(1, 'ServerStorageManager', `Successfully stored ${variants.length} variants for ${individualId}`);
    return variants.length;
  }

  async getVariants(individualId) {
    await this.initialize();
    
    Debug.log(2, 'ServerStorageManager', `Loading variants for individual: ${individualId}`);
    
    const metadata = await this._getQuery(
      'SELECT file_path FROM variant_files WHERE individual_id = ?',
      [individualId]
    );
    
    if (!metadata) {
      Debug.log(2, 'ServerStorageManager', `No variants found for individual: ${individualId}`);
      return [];
    }

    try {
      const fileContent = await fs.readFile(metadata.file_path, 'utf8');
      const variantData = JSON.parse(fileContent);
      
      // Convert to format expected by genomic processor
      const variants = variantData.variants.map(variant => ({
        rsid: variant.rsid,
        chromosome: variant.chromosome,
        position: variant.position,
        allele1: variant.allele1,
        allele2: variant.allele2
      }));
      
      Debug.log(2, 'ServerStorageManager', `Loaded ${variants.length} variants for ${individualId}`);
      return variants;
      
    } catch (error) {
      Debug.log(1, 'ServerStorageManager', `Failed to load variants for ${individualId}:`, error.message);
      return [];
    }
  }

  // Risk score storage and retrieval
  async storeRiskScore(individualId, traitId, riskData) {
    await this.initialize();
    
    Debug.log(1, 'ServerStorageManager', `💾 Storing risk score for ${individualId}:${traitId} - Score: ${riskData.riskScore}`);
    
    try {
      // Store directly to parquet file - no database storage
      await this.appendToParquetFile(individualId, traitId, riskData);
      
      Debug.log(1, 'ServerStorageManager', `✅ Successfully stored risk score for ${individualId}:${traitId}`);
    } catch (error) {
      Debug.log(1, 'ServerStorageManager', `❌ Failed to store risk score for ${individualId}:${traitId}:`, error.message);
      throw error;
    }
  }

  async getCachedRiskScore(individualId, traitId) {
    await this.initialize();
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
      
      // Use a separate read-only connection for queries to avoid locking
      const duckdb = await import('duckdb');
      const readDb = new duckdb.default.Database(cacheFile, duckdb.default.OPEN_READONLY);
      const readConn = readDb.connect();
      
      const row = await new Promise((resolve, reject) => {
        readConn.all(
          `SELECT * FROM risk_scores WHERE individual_id = ? AND trait_id = ?`,
          individualId, traitId,
          (err, result) => {
            readConn.close();
            readDb.close();
            if (err) reject(err);
            else resolve(result?.[0] || null);
          }
        );
      });
      
      if (!row) {
        Debug.log(3, 'ServerStorageManager', `No cached result found for ${individualId}:${traitId}`);
        return null;
      }
      
      Debug.log(3, 'ServerStorageManager', `Found cached result for ${individualId}:${traitId}`);
      return {
        riskScore: row.risk_score,
        pgsBreakdown: JSON.parse(row.pgs_breakdown || '{}'),
        pgsDetails: JSON.parse(row.pgs_details || '{}'),
        matchedVariants: Number(row.matched_variants),
        totalVariants: Number(row.total_variants),
        traitLastUpdated: row.trait_last_updated,
        calculatedAt: new Date(Number(row.calculated_at)).toISOString()
      };
    } catch (error) {
      Debug.log(1, 'ServerStorageManager', `Error querying cached result for ${individualId}:${traitId}:`, error.message);
      return null;
    }
  }

  async getCachedResults(individualId) {
    await this.initialize();
    
    const rows = await this._allQuery(
      'SELECT * FROM risk_scores WHERE individual_id = ? ORDER BY calculated_at DESC',
      [individualId]
    );
    
    return rows.map(row => ({
      traitId: row.trait_id,
      riskScore: row.risk_score,
      pgsBreakdown: JSON.parse(row.pgs_breakdown || '{}'),
      pgsDetails: JSON.parse(row.pgs_details || '{}'),
      matchedVariants: Number(row.matched_variants),
      totalVariants: Number(row.total_variants),
      traitLastUpdated: row.trait_last_updated,
      calculatedAt: new Date(Number(row.calculated_at)).toISOString()
    }));
  }

  async getAllCachedResults() {
    await this.initialize();
    
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
    } catch {
      return [];
    }
    
    // ATTACH the external database and query it
    await this._runQuery(`ATTACH '${cacheFile.replace(/\\/g, '/')}' AS risk_cache`);
    const rows = await this._allQuery(`SELECT * FROM risk_cache.risk_scores ORDER BY individual_id, calculated_at DESC`);
    await this._runQuery(`DETACH risk_cache`);
    
    return rows.map(row => ({
      individual_id: row.individual_id,
      trait_id: row.trait_id,
      risk_score: row.risk_score,
      pgs_breakdown: row.pgs_breakdown,
      pgs_details: row.pgs_details,
      matched_variants: Number(row.matched_variants),
      total_variants: Number(row.total_variants),
      trait_last_updated: row.trait_last_updated,
      calculated_at: Number(row.calculated_at)
    }));
  }

  async deleteIndividual(individualId) {
    await this.initialize();
    
    // Delete from all tables
    await this._runQuery('DELETE FROM individuals WHERE id = ?', [individualId]);
    await this._runQuery('DELETE FROM variant_files WHERE individual_id = ?', [individualId]);
    await this._runQuery('DELETE FROM risk_scores WHERE individual_id = ?', [individualId]);
    
    // Delete variant file
    const variantFile = path.join(this.dataDir, 'variants', `${individualId}.json`);
    try {
      await fs.unlink(variantFile);
    } catch (error) {
      // File might not exist, ignore
    }
  }

  async clearCache() {
    await this.initialize();
    
    await this._runQuery('DELETE FROM risk_scores');
  }

  async initializeEmptyParquet() {
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
      Debug.log(2, 'ServerStorageManager', 'Risk scores DB already exists, skipping initialization');
      return;
    } catch {
      Debug.log(1, 'ServerStorageManager', 'Creating empty risk scores DB...');
    }
    
    // Create empty DuckDB file with risk scores table
    await this._runQuery(`
      ATTACH '${cacheFile.replace(/\\/g, '/')}' AS risk_cache;
      CREATE TABLE risk_cache.risk_scores (
        individual_id VARCHAR,
        trait_id VARCHAR,
        risk_score DOUBLE,
        pgs_breakdown VARCHAR,
        pgs_details VARCHAR,
        matched_variants INTEGER,
        total_variants INTEGER,
        trait_last_updated VARCHAR,
        calculated_at BIGINT,
        PRIMARY KEY (individual_id, trait_id)
      );
      DETACH risk_cache;
    `);
    
    Debug.log(1, 'ServerStorageManager', 'Empty risk scores DB created successfully');
  }

  async appendToParquetFile(individualId, traitId, riskData) {
    await this.initialize();
    
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    // Simple INSERT with ATTACH/DETACH
    await this._runQuery(`
      ATTACH '${cacheFile.replace(/\\/g, '/')}' AS risk_cache;
      INSERT OR REPLACE INTO risk_cache.risk_scores VALUES (
        '${individualId}',
        '${traitId}',
        ${riskData.riskScore},
        '${JSON.stringify(riskData.pgsBreakdown || {})}',
        '${JSON.stringify(riskData.pgsDetails || {})}',
        ${Number(riskData.matchedVariants || 0)},
        ${Number(riskData.totalVariants || 0)},
        ${riskData.traitLastUpdated ? `'${riskData.traitLastUpdated}'` : 'NULL'},
        ${Number(Date.now())}
      );
      DETACH risk_cache;
    `);
  }

  async cleanup() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.db) {
      this.db.close();
    }
  }
}