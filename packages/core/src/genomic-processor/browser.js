/**
 * Browser-specific genomic processor implementation
 * Uses DuckDB WASM and IndexedDB for client-side processing
 */

import { GenomicProcessor } from '../interfaces/genomic.js';
import { PROGRESS_STAGES, PROGRESS_SUBSTAGES } from '../progress/tracker.js';
import { Debug } from '../utils/debug.js';
import { StreamingProcessor, PGSAggregator } from './streaming-utils.js';

export class BrowserGenomicProcessor extends GenomicProcessor {
  constructor(config, progressTracker) {
    super(config, progressTracker);
    this.db = null;
    this.conn = null;
  }

  async initialize() {
    if (this.db) return;

    this.progress.setStage(
      PROGRESS_STAGES.INITIALIZING,
      'Initializing DuckDB...'
    );

    try {
      // Dynamic import for browser environment
      const duckdb = await import('/deps/duckdb.js');

      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.VoidLogger(); // Use VoidLogger to disable query logging

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();

      // Configure DuckDB for HTTP streaming
      await this.conn.query('INSTALL httpfs');
      await this.conn.query('LOAD httpfs');
      await this.conn.query('SET http_timeout=30000');

      this.progress.setProgress(100, 'DuckDB initialized');
    } catch (error) {
      this.progress.setError(error);
      throw error;
    }
  }

  async loadDataset(source) {
    await this.initialize();

    this.progress.setStage(PROGRESS_STAGES.LOADING_DATA, 'Loading dataset...');

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
      this.progress.setError(error);
      throw error;
    }
  }

  async _loadFromUrl(url, options = {}) {
    this.progress.setSubstage(
      PROGRESS_SUBSTAGES.FETCHING_TRAITS,
      'Fetching data...'
    );

    Debug.log(2, 'BrowserGenomicProcessor', `DuckDB loading from URL: ${url}`);

    // Register HTTP filesystem for range requests
    await this.db.registerFileURL('data.parquet', url, 4);

    const tableName = options.tableName || 'dataset';
    await this.conn.query(
      `CREATE TABLE ${tableName} AS SELECT * FROM 'data.parquet'`
    );

    // Get schema information
    const schemaResult = await this.conn.query(`DESCRIBE ${tableName}`);
    const schema = {};
    for (const row of schemaResult.toArray()) {
      schema[row.column_name] = row.column_type;
    }

    this.progress.setProgress(100, 'Dataset loaded');

    return {
      id: tableName,
      type: 'pgs',
      schema,
      metadata: { url, ...options }
    };
  }

  async _loadFromFile(file, options = {}) {
    this.progress.setSubstage(
      PROGRESS_SUBSTAGES.PARSING_DNA_FILE,
      'Reading file...'
    );

    const buffer = await file.arrayBuffer();
    await this.db.registerFileBuffer('upload.parquet', new Uint8Array(buffer));

    const tableName = options.tableName || 'dataset';
    await this.conn.query(
      `CREATE TABLE ${tableName} AS SELECT * FROM 'upload.parquet'`
    );

    const schemaResult = await this.conn.query(`DESCRIBE ${tableName}`);
    const schema = {};
    for (const row of schemaResult.toArray()) {
      schema[row.column_name] = row.column_type;
    }

    this.progress.setProgress(100, 'File loaded');

    return {
      id: tableName,
      type: 'pgs',
      schema,
      metadata: { filename: file.name, size: file.size, ...options }
    };
  }

  async calculateRisk(traitUrl, userDNA, progressCallback, pgsMetadata = {}, normalizationParams = {}, traitType = 'disease_risk', unit = null, phenotypeMean = null, phenotypeSd = null) {
    Debug.log(
      1,
      'BrowserGenomicProcessor',
      `Starting risk calculation with ${userDNA.length} user DNA variants`
    );
    Debug.log(
      2,
      'BrowserGenomicProcessor',
      `Loading trait data from: ${traitUrl}`
    );

    await this.initialize();

    // Stream process the parquet file instead of loading entirely into memory
    return await this.streamCalculateRisk(
      traitUrl,
      userDNA,
      progressCallback,
      pgsMetadata,
      normalizationParams,
      traitType,
      unit
    );
  }

  async streamCalculateRisk(
    traitUrl,
    userDNA,
    progressCallback,
    pgsMetadata = {},
    normalizationParams = {},
    traitType = 'disease_risk',
    unit = null
  ) {
    progressCallback?.('Initializing streaming...', 5);

    // Create streaming processor with optimized settings for large datasets
    const streamProcessor = new StreamingProcessor(this.conn, {
      chunkSize: 5000, // Smaller chunks for memory efficiency
      memoryThreshold: 0.75,
      yieldInterval: 3
    });

    // Create DNA lookup maps
    const { rsidMap, posMap } = streamProcessor.createDNALookup(userDNA);
    Debug.log(
      2,
      'BrowserGenomicProcessor',
      `Created lookup maps: ${rsidMap.size} rsids, ${posMap.size} positions`
    );

    // Initialize aggregator
    const aggregator = new PGSAggregator(normalizationParams);

    // Process parquet file in streaming chunks
    const processedRows = await streamProcessor.processParquetStream(
      traitUrl,
      async (chunkData, chunkNum, totalChunks) => {
        let chunkMatches = 0;

        for (const trait of chunkData) {
          // Initialize PGS if needed
          aggregator.initializePGS(
            trait.pgs_id,
            pgsMetadata[trait.pgs_id] || {}
          );

          // Match variant
          const genotype = streamProcessor.matchVariant(
            trait.variant_id,
            rsidMap,
            posMap
          );

          if (genotype && genotype.includes(trait.effect_allele)) {
            aggregator.addVariant(
              trait.pgs_id,
              trait,
              genotype,
              trait.effect_weight
            );
            chunkMatches++;
          }
        }

        if (chunkNum % 50 === 0 || chunkNum === totalChunks) {
          Debug.log(
            2,
            'BrowserGenomicProcessor',
            `Stream chunk ${chunkNum}: ${chunkMatches} matches, total: ${aggregator.totalMatches}`
          );
        }
      },
      (message, progress) => {
        const adjustedProgress = 20 + progress * 0.7; // Map to 20-90% range
        progressCallback?.(message, adjustedProgress);
      }
    );

    progressCallback?.('Finalizing results...', 95);

    // Finalize and cleanup
    const results = aggregator.finalize(traitType, unit, phenotypeMean, phenotypeSd);
    aggregator.cleanup();
    rsidMap.clear();
    posMap.clear();

    Debug.log(
      1,
      'BrowserGenomicProcessor',
      `Stream processing complete: score=${results.riskScore.toFixed(6)}, matches=${results.totalMatches}, rows=${processedRows}`
    );

    progressCallback?.('Complete', 100);
    return results;
  }

  async loadParquet(url, tableName) {
    // Convert relative URLs to absolute for DuckDB worker
    const absoluteUrl = url.startsWith('/')
      ? `${window.location.origin}${url}`
      : url;
    await this.conn.query(
      `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM '${absoluteUrl}'`
    );
  }

  _interpretScore(percentile) {
    if (percentile >= 90) return 'High risk';
    if (percentile >= 70) return 'Elevated risk';
    if (percentile >= 30) return 'Average risk';
    if (percentile >= 10) return 'Below average risk';
    return 'Low risk';
  }

  async cacheResults(results) {
    // Use IndexedDB for caching in browser
    const request = indexedDB.open('asili-cache', 1);

    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['results'], 'readwrite');
        const store = transaction.objectStore('results');

        const cacheEntry = {
          id: Date.now(),
          results,
          timestamp: new Date().toISOString()
        };

        store.put(cacheEntry);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('results')) {
          db.createObjectStore('results', { keyPath: 'id' });
        }
      };
    });
  }

  async cleanup() {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
  }
}
