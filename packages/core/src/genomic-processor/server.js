/**
 * Server-side genomic processor using Node.js and native DuckDB
 * Provides background processing capabilities without browser limitations
 */

import { GenomicProcessor } from '../interfaces/genomic.js';
import { Debug } from '../utils/debug.js';
import { PerformanceMonitor } from '../utils/performance.js';
import { SharedRiskCalculator } from './shared-calculator.js';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ServerGenomicProcessor extends GenomicProcessor {
  constructor(config, progressTracker) {
    super(config, progressTracker);
    this.db = null;
    this.conn = null;
    this.duckdb = null;
  }

  async initialize() {
    if (this.db) return;

    this.progress?.setStage('INITIALIZING', 'Initializing DuckDB...');

    try {
      // Dynamic import for Node.js DuckDB
      const duckdb = await import('duckdb');
      
      this.db = new duckdb.default.Database(':memory:');
      this.conn = this.db.connect();

      // Install and load httpfs for remote file access
      await this.query('INSTALL httpfs');
      await this.query('LOAD httpfs');
      await this.query('SET http_timeout=60000');
      await this.query(`SET threads=${Math.max(2, Math.floor(cpus().length / 2))}`);
      await this.query('SET memory_limit=\'4GB\'');
      await this.query('SET preserve_insertion_order=false');
      await this.query('SET enable_http_metadata_cache=true');

      this.progress?.setProgress(100, 'DuckDB initialized');
      Debug.log(1, 'ServerGenomicProcessor', 'DuckDB initialized successfully');
      
    } catch (error) {
      this.progress?.setError(error);
      throw new Error(`Failed to initialize DuckDB: ${error.message}`);
    }
  }

  async query(sql) {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  async loadDataset(source) {
    await this.initialize();
    
    this.progress?.setStage('LOADING_DATA', 'Loading dataset...');

    try {
      switch (source.type) {
        case 'url':
          return await this._loadFromUrl(source.source, source.options);
        case 'file':
          return await this._loadFromFile(source.source, source.options);
        default:
          throw new Error(`Unsupported source type: ${source.type}`);
      }
    } catch (error) {
      this.progress?.setError(error);
      throw error;
    }
  }

  async _loadFromUrl(url, options = {}) {
    const tableName = options.tableName || 'dataset';
    
    Debug.log(2, 'ServerGenomicProcessor', `Loading from URL: ${url}`);
    
    await this.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${url}'`);
    
    // Get schema information
    const schemaResult = await this.query(`DESCRIBE ${tableName}`);
    const schema = {};
    schemaResult.forEach(row => {
      schema[row.column_name] = row.column_type;
    });

    this.progress?.setProgress(100, 'Dataset loaded');

    return {
      id: tableName,
      type: 'pgs',
      schema,
      metadata: { url, ...options }
    };
  }

  async _loadFromFile(filePath, options = {}) {
    const tableName = options.tableName || 'dataset';
    
    Debug.log(2, 'ServerGenomicProcessor', `Loading from file: ${filePath}`);
    
    await this.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${filePath}'`);
    
    const schemaResult = await this.query(`DESCRIBE ${tableName}`);
    const schema = {};
    schemaResult.forEach(row => {
      schema[row.column_name] = row.column_type;
    });

    this.progress?.setProgress(100, 'File loaded');

    return {
      id: tableName,
      type: 'pgs',
      schema,
      metadata: { filePath, ...options }
    };
  }

  async calculateRisk(traitUrl, userDNA, progressCallback, pgsMetadata = {}) {
    Debug.log(1, 'ServerGenomicProcessor', `Starting risk calculation with ${userDNA.length} variants`);
    
    await this.initialize();
    
    try {
      progressCallback?.('Loading trait data...', 5);
      
      // Get total count
      const traitCountResult = await this.query(`SELECT COUNT(*) as count FROM '${traitUrl}'`);
      const totalTraitVariants = Number(traitCountResult[0]?.count || 0);
      
      progressCallback?.('Starting parallel processing...', 10);
      
      // Initialize performance monitoring
      const perfMonitor = new PerformanceMonitor();
      perfMonitor.start();
      
      // Dynamic worker allocation based on dataset size
      const availableCPUs = cpus().length;
      const isLargeDataset = totalTraitVariants > 50000000; // 50M+ variants
      const numWorkers = isLargeDataset 
        ? Math.min(availableCPUs, Math.max(4, Math.ceil(totalTraitVariants / 10000000)))
        : Math.min(availableCPUs, Math.max(2, Math.ceil(totalTraitVariants / 5000000)));
      const chunkSize = Math.ceil(totalTraitVariants / numWorkers);
      const workerScript = isLargeDataset ? 'streaming-worker.js' : 'parallel-worker.js';
      
      Debug.log(1, 'ServerGenomicProcessor', `Using ${numWorkers} ${isLargeDataset ? 'streaming' : 'standard'} workers, ~${Math.round(chunkSize/1000)}k variants each`);
      
      // Launch workers with progress tracking
      const workers = [];
      const workerProgress = new Array(numWorkers).fill(0);
      
      for (let i = 0; i < numWorkers; i++) {
        const workerPromise = new Promise((resolve, reject) => {
          const worker = new Worker(join(__dirname, workerScript), {
            workerData: {
              traitUrl,
              userDNA,
              offset: i * chunkSize,
              limit: chunkSize,
              pgsMetadata
            }
          });
          
          worker.on('message', (msg) => {
            if (msg.type === 'progress') {
              workerProgress[i] = msg.processed;
              const totalProcessed = workerProgress.reduce((a, b) => a + b, 0);
              const throughput = perfMonitor.update(totalProcessed);
              const progress = 10 + Math.min(80, Math.round((totalProcessed / totalTraitVariants) * 80));
              
              if (throughput) {
                const message = `Processing: ${Math.round(totalProcessed/1000)}k/${Math.round(totalTraitVariants/1000)}k variants (${throughput.toLocaleString()}/sec)`;
                progressCallback?.(message, progress, {
                  processed: totalProcessed,
                  total: totalTraitVariants,
                  throughput: throughput
                });
              }
            } else if (msg.type === 'complete') {
              resolve(msg);
            } else {
              resolve(msg);
            }
          });
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker ${i} exited with code ${code}`));
          });
        });
        
        workers.push(workerPromise);
      }
      
      // Wait for all workers
      const results = await Promise.all(workers);
      
      progressCallback?.('Merging results...', 90);
      
      // Merge results from all workers
      const merged = this._mergeResults(results);
      
      // Log final performance stats
      const stats = perfMonitor.getStats();
      Debug.log(1, 'ServerGenomicProcessor', `Processing complete: ${stats.variantsProcessed.toLocaleString()} variants in ${stats.elapsed}s (avg ${stats.avgThroughput.toLocaleString()}/sec)`);
      
      progressCallback?.('Complete', 100);
      
      console.log(`✅ Risk calculation complete: score=${merged.riskScore}, matches=${merged.totalMatches}`);
      
      return merged;
      
    } catch (error) {
      Debug.log(1, 'ServerGenomicProcessor', 'Risk calculation failed:', error);
      throw error;
    }
  }

  _runWorker(workerData) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, 'parallel-worker.js'), { workerData });
      
      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          // Ignore progress messages, just collect final result
        } else if (msg.type === 'complete') {
          resolve(msg);
        } else {
          resolve(msg); // Legacy format
        }
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }

  _mergeResults(results) {
    const calculator = new SharedRiskCalculator();
    
    for (const result of results) {
      if (result.error) throw new Error(result.error);
      
      // Merge PGS breakdowns
      for (const [pgsId, breakdown] of Object.entries(result.pgsBreakdown)) {
        calculator.initializePGS(pgsId);
        const merged = calculator.pgsBreakdown.get(pgsId);
        merged.positive += breakdown.positive;
        merged.negative += breakdown.negative;
        merged.positiveSum += breakdown.positiveSum;
        merged.negativeSum += breakdown.negativeSum;
        merged.total += breakdown.total;
      }
      
      // Merge PGS details
      for (const [pgsId, details] of Object.entries(result.pgsDetails)) {
        calculator.initializePGS(pgsId, details.metadata);
        const merged = calculator.pgsDetails.get(pgsId);
        merged.score += details.score;
        merged.matchedVariants += details.matchedVariants;
        merged.topVariants.push(...details.topVariants);
      }
      
      calculator.totalMatches += result.totalMatches;
      calculator.totalScore += result.totalScore;
    }
    
    return calculator.finalize();
  }

  async cacheResults(results) {
    // Server-side caching could use filesystem, Redis, or database
    // For now, just log the results
    Debug.log(2, 'ServerGenomicProcessor', 'Caching results:', Object.keys(results));
  }

  async cleanup() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}