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
      
      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_individuals_status ON individuals(status)`
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
    
    Debug.log(1, 'ServerStorageManager', `💾 Storing risk score for ${individualId}:${traitId}`);
    
    try {
      const cacheFile = PATHS.RISK_SCORES_DB;
      
      // Ensure DB exists with schema
      try {
        await fs.access(cacheFile);
      } catch {
        await this.initializeEmptyParquet();
      }
      
      // Calculate totals from pgsDetails
      let totalMatched = 0;
      let totalExpected = 0;
      for (const details of Object.values(riskData.pgsDetails || {})) {
        totalMatched += details.matchedVariants || 0;
        totalExpected += details.metadata?.variants_count || 0;
      }
      
      // Sort PGS by canonical ordering (best first)
      const sortedPgs = Object.entries(riskData.pgsBreakdown || [])
        .map(([pgsId, breakdown]) => ({
          pgsId,
          breakdown,
          details: riskData.pgsDetails?.[pgsId]
        }))
        .sort((a, b) => {
          const insuffA = a.details?.insufficientData || false;
          const insuffB = b.details?.insufficientData || false;
          if (insuffA !== insuffB) return insuffA ? 1 : -1;
          
          const perfA = a.details?.performanceMetric || 0;
          const perfB = b.details?.performanceMetric || 0;
          if (perfA !== perfB) return perfB - perfA;
          
          return Math.abs(b.breakdown.positiveSum + b.breakdown.negativeSum) - 
                 Math.abs(a.breakdown.positiveSum + a.breakdown.negativeSum);
        });
      
      const duckdb = await import('duckdb');
      const writeDb = new duckdb.default.Database(cacheFile);
      const writeConn = writeDb.connect();
      
      await new Promise((resolve, reject) => {
        // Store trait-level result
        writeConn.exec(`
          INSERT OR REPLACE INTO trait_results VALUES (
            '${individualId}', '${traitId}', 
            ${riskData.bestPGS ? `'${riskData.bestPGS}'` : 'NULL'},
            ${riskData.bestPGSPerformance || 'NULL'},
            ${riskData.zScore !== null && riskData.zScore !== undefined ? riskData.zScore : 'NULL'},
            ${riskData.percentile || 'NULL'},
            ${riskData.confidence ? `'${riskData.confidence}'` : 'NULL'},
            ${totalMatched},
            ${totalExpected},
            ${riskData.traitLastUpdated ? `'${riskData.traitLastUpdated}'` : 'NULL'},
            ${Date.now()},
            ${riskData.value !== null && riskData.value !== undefined ? riskData.value : 'NULL'}
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Store PGS-level results with sort order
          const pgsInserts = [];
          sortedPgs.forEach((item, index) => {
            const { pgsId, breakdown, details } = item;
            if (!details) return;
            
            const weightBucketsJson = breakdown.weightBuckets ? JSON.stringify(breakdown.weightBuckets).replace(/'/g, "''") : '[]';
            const chromosomeCoverageJson = breakdown.chromosomeCoverage ? JSON.stringify(breakdown.chromosomeCoverage).replace(/'/g, "''") : '{}';
            const topVariantsJson = details.topVariants ? JSON.stringify(details.topVariants).replace(/'/g, "''") : '[]';
            
            pgsInserts.push(`
              ('${individualId}', '${traitId}', '${pgsId}',
               ${details.score || 0}, 
               ${details.zScore !== null && details.zScore !== undefined ? details.zScore : 'NULL'},
               ${details.percentile || 'NULL'},
               ${details.matchedVariants || 0},
               ${details.metadata?.variants_count || 0},
               ${details.confidence ? `'${details.confidence}'` : 'NULL'},
               ${details.insufficientData ? 'TRUE' : 'FALSE'},
               ${details.performanceMetric || 'NULL'},
               ${breakdown.positive || 0}, ${breakdown.positiveSum || 0},
               ${breakdown.negative || 0}, ${breakdown.negativeSum || 0},
               ${index},
               ${details.value !== null && details.value !== undefined ? details.value : 'NULL'},
               '${weightBucketsJson}',
               '${chromosomeCoverageJson}',
               '${topVariantsJson}')
            `);
          });
          
          if (pgsInserts.length > 0) {
            writeConn.exec(`
              INSERT OR REPLACE INTO pgs_results VALUES ${pgsInserts.join(',')}
            `, (err2) => {
              writeConn.close();
              writeDb.close();
              if (err2) reject(err2);
              else resolve();
            });
          } else {
            writeConn.close();
            writeDb.close();
            resolve();
          }
        });
      });
      
      Debug.log(1, 'ServerStorageManager', `✅ Successfully stored risk score for ${individualId}:${traitId}`);
    } catch (error) {
      Debug.log(1, 'ServerStorageManager', `❌ Failed to store risk score:`, error.message);
      throw error;
    }
  }

  _getTotalExpectedVariants(pgsDetails) {
    if (!pgsDetails) return 0;
    return Object.values(pgsDetails).reduce((sum, d) => sum + (d.metadata?.variants_count || 0), 0);
  }

  async getCachedRiskScore(individualId, traitId) {
    await this.initialize();
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
      
      const duckdb = await import('duckdb');
      const readDb = new duckdb.default.Database(cacheFile, duckdb.default.OPEN_READONLY);
      const readConn = readDb.connect();
      
      const result = await new Promise((resolve, reject) => {
        const sql = `SELECT 
             tr.*,
             (SELECT json_group_array(json_object(
               'pgs_id', pgs_id, 'raw_score', raw_score, 'z_score', z_score,
               'percentile', percentile, 'matched_variants', matched_variants,
               'confidence', confidence, 'insufficient_data', insufficient_data,
               'performance_metric', performance_metric,
               'positive_variants', positive_variants, 'positive_sum', positive_sum,
               'negative_variants', negative_variants, 'negative_sum', negative_sum,
               'expected_variants', expected_variants, 'sort_order', sort_order,
               'weight_buckets', weight_buckets, 'chromosome_coverage', chromosome_coverage,
               'top_variants', top_variants
             )) FROM (SELECT * FROM pgs_results WHERE individual_id = tr.individual_id AND trait_id = tr.trait_id ORDER BY sort_order ASC)) as pgs_list
           FROM trait_results tr
           WHERE tr.individual_id = '${individualId.replace(/'/g, "''")}' AND tr.trait_id = '${traitId.replace(/'/g, "''")}'`;
        readConn.all(sql, (err, rows) => {
            readConn.close();
            readDb.close();
            if (err) reject(err);
            else resolve(rows?.[0] || null);
          }
        );
      });
      
      if (!result) return null;
      
      const pgsList = JSON.parse(result.pgs_list || '[]');
      const pgsBreakdown = {};
      const pgsDetails = {};
      
      pgsList.forEach(pgs => {
        const weightBuckets = typeof pgs.weight_buckets === 'string' ? JSON.parse(pgs.weight_buckets) : (pgs.weight_buckets || []);
        const chromosomeCoverage = typeof pgs.chromosome_coverage === 'string' ? JSON.parse(pgs.chromosome_coverage) : (pgs.chromosome_coverage || {});
        const topVariants = typeof pgs.top_variants === 'string' ? JSON.parse(pgs.top_variants) : (pgs.top_variants || []);
        pgsBreakdown[pgs.pgs_id] = {
          positive: pgs.positive_variants,
          positiveSum: pgs.positive_sum,
          negative: pgs.negative_variants,
          negativeSum: pgs.negative_sum,
          total: pgs.positive_variants + pgs.negative_variants,
          weightBuckets,
          chromosomeCoverage,
          topVariants
        };
        pgsDetails[pgs.pgs_id] = {
          score: pgs.raw_score,
          zScore: pgs.z_score,
          percentile: pgs.percentile,
          matchedVariants: pgs.matched_variants,
          confidence: pgs.confidence,
          insufficientData: pgs.insufficient_data,
          performanceMetric: pgs.performance_metric,
          sortOrder: pgs.sort_order,
          metadata: { variants_count: pgs.expected_variants }
        };
      });
      
      return {
        zScore: result.overall_z_score,
        percentile: result.overall_percentile,
        confidence: result.overall_confidence,
        bestPGS: result.best_pgs_id,
        bestPGSPerformance: result.best_pgs_performance,
        matchedVariants: Number(result.total_matched_variants),
        totalVariants: Number(result.total_expected_variants),
        pgsBreakdown,
        pgsDetails,
        traitLastUpdated: result.trait_last_updated,
        calculatedAt: new Date(Number(result.calculated_at)).toISOString(),
        value: result.value
      };
    } catch (error) {
      Debug.log(1, 'ServerStorageManager', `Error in getCachedRiskScore: ${error.message}`);
      throw error;
    }
  }

  async getCachedResults(individualId) {
    await this.initialize();
    
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
    } catch {
      return [];
    }
    
    const duckdb = await import('duckdb');
    const readDb = new duckdb.default.Database(cacheFile, duckdb.default.OPEN_READONLY);
    const readConn = readDb.connect();
    
    const rows = await new Promise((resolve, reject) => {
      const sql = `SELECT * FROM trait_results WHERE individual_id = '${individualId.replace(/'/g, "''")}' ORDER BY calculated_at DESC`;
      readConn.all(sql, (err, result) => {
          readConn.close();
          readDb.close();
          if (err) reject(err);
          else resolve(result || []);
        }
      );
    });
    
    return rows.map(row => ({
      traitId: row.trait_id,
      zScore: row.overall_z_score,
      percentile: row.overall_percentile,
      confidence: row.overall_confidence,
      bestPGS: row.best_pgs_id,
      matchedVariants: Number(row.total_matched_variants),
      totalVariants: Number(row.total_expected_variants),
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
    
    const duckdb = await import('duckdb');
    const readDb = new duckdb.default.Database(cacheFile, duckdb.default.OPEN_READONLY);
    const readConn = readDb.connect();
    
    const rows = await new Promise((resolve, reject) => {
      readConn.all('SELECT * FROM trait_results ORDER BY individual_id, calculated_at DESC', (err, result) => {
        readConn.close();
        readDb.close();
        if (err) reject(err);
        else resolve(result || []);
      });
    });
    
    return rows.map(row => ({
      individual_id: row.individual_id,
      trait_id: row.trait_id,
      z_score: row.overall_z_score,
      percentile: row.overall_percentile,
      confidence: row.overall_confidence,
      best_pgs_id: row.best_pgs_id,
      matched_variants: Number(row.total_matched_variants),
      total_variants: Number(row.total_expected_variants),
      calculated_at: Number(row.calculated_at)
    }));
  }

  async deleteIndividual(individualId) {
    await this.initialize();
    
    // Delete from main DB tables
    await this._runQuery('DELETE FROM individuals WHERE id = ?', [individualId]);
    await this._runQuery('DELETE FROM variant_files WHERE individual_id = ?', [individualId]);
    
    // Delete from risk results DB
    const cacheFile = PATHS.RISK_SCORES_DB;
    try {
      await fs.access(cacheFile);
      const duckdb = await import('duckdb');
      const writeDb = new duckdb.default.Database(cacheFile);
      const writeConn = writeDb.connect();
      
      await new Promise((resolve, reject) => {
        writeConn.exec(`
          DELETE FROM trait_results WHERE individual_id = '${individualId}';
          DELETE FROM pgs_results WHERE individual_id = '${individualId}';
          DELETE FROM pgs_top_variants WHERE individual_id = '${individualId}';
        `, (err) => {
          writeConn.close();
          writeDb.close();
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      // Risk DB might not exist yet
    }
    
    // Delete variant file
    const variantFile = path.join(this.dataDir, 'variants', `${individualId}.json`);
    try {
      await fs.unlink(variantFile);
    } catch (error) {
      // File might not exist, ignore
    }
  }

  async clearCache() {
    const cacheFile = PATHS.RISK_SCORES_DB;
    
    try {
      await fs.access(cacheFile);
      const duckdb = await import('duckdb');
      const writeDb = new duckdb.default.Database(cacheFile);
      const writeConn = writeDb.connect();
      
      await new Promise((resolve, reject) => {
        writeConn.exec(`
          DELETE FROM trait_results;
          DELETE FROM pgs_results;
          DELETE FROM pgs_top_variants;
        `, (err) => {
          writeConn.close();
          writeDb.close();
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      // DB might not exist yet
    }
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
    
    await this._runQuery(`
      ATTACH '${cacheFile.replace(/\\/g, '/')}' AS risk_cache;
      
      CREATE TABLE risk_cache.trait_results (
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
        value DOUBLE,
        PRIMARY KEY (individual_id, trait_id)
      );
      
      CREATE TABLE risk_cache.pgs_results (
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
        sort_order INTEGER,
        value DOUBLE,
        weight_buckets JSON,
        chromosome_coverage JSON,
        top_variants JSON,
        PRIMARY KEY (individual_id, trait_id, pgs_id)
      );
      
      DETACH risk_cache;
    `);
    
    Debug.log(1, 'ServerStorageManager', 'Empty risk scores DB created successfully');
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
