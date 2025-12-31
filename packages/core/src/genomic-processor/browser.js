/**
 * Browser-specific genomic processor implementation
 * Uses DuckDB WASM and IndexedDB for client-side processing
 */

import { GenomicProcessor } from '../interfaces/genomic.js';
import { PROGRESS_STAGES, PROGRESS_SUBSTAGES } from '../progress/tracker.js';
import { Debug } from '../utils/debug.js';

export class BrowserGenomicProcessor extends GenomicProcessor {
  constructor(config, progressTracker) {
    super(config, progressTracker);
    this.db = null;
    this.conn = null;
  }

  async initialize() {
    if (this.db) return;

    this.progress.setStage(PROGRESS_STAGES.INITIALIZING, 'Initializing DuckDB...');
    
    try {
      // Dynamic import for browser environment
      const duckdb = await import('@duckdb/duckdb-wasm');
      
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const logger = new duckdb.VoidLogger(); // Use VoidLogger to disable query logging
      
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.conn = await this.db.connect();
      
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
    this.progress.setSubstage(PROGRESS_SUBSTAGES.FETCHING_TRAITS, 'Fetching data...');
    
    Debug.log(2, 'BrowserGenomicProcessor', `DuckDB loading from URL: ${url}`);
    
    // Register HTTP filesystem for range requests
    await this.db.registerFileURL('data.parquet', url, 4);
    
    const tableName = options.tableName || 'dataset';
    await this.conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM 'data.parquet'`);
    
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
    this.progress.setSubstage(PROGRESS_SUBSTAGES.PARSING_DNA_FILE, 'Reading file...');
    
    const buffer = await file.arrayBuffer();
    await this.db.registerFileBuffer('upload.parquet', new Uint8Array(buffer));
    
    const tableName = options.tableName || 'dataset';
    await this.conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM 'upload.parquet'`);
    
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

  async calculateRisk(traitUrl, userDNA, progressCallback, pgsMetadata = {}) {
    Debug.log(1, 'BrowserGenomicProcessor', `Starting risk calculation with ${userDNA.length} user DNA variants`);
    Debug.log(2, 'BrowserGenomicProcessor', `Loading trait data from: ${traitUrl}`);
    
    await this.initialize();
    
    progressCallback?.('Loading trait data...', 5);
    await this.loadParquet(traitUrl, 'trait_data');
    
    // Get total count for progress
    progressCallback?.('Counting variants...', 10);
    const countResult = await this.conn.query('SELECT COUNT(*) as total FROM trait_data');
    const totalVariants = Number(countResult.toArray()[0].total);
    
    Debug.log(1, 'BrowserGenomicProcessor', `Processing ${totalVariants} trait variants in chunks`);
    
    // Adaptive chunk size based on dataset size - increased for better throughput
    let CHUNK_SIZE;
    if (totalVariants > 5000000) {
      CHUNK_SIZE = 10000;  // Increased from 2500
    } else if (totalVariants > 1000000) {
      CHUNK_SIZE = 20000;  // Increased from 5000
    } else {
      CHUNK_SIZE = 50000;  // Increased from 25000
    }
    
    Debug.log(2, 'BrowserGenomicProcessor', `Using chunk size: ${CHUNK_SIZE} for ${totalVariants} variants`);
    
    let riskScore = 0;
    const pgsBreakdown = new Map();
    const pgsDetails = new Map();
    const pgsDistributions = new Map(); // Add distribution tracking
    
    // Define bins for distribution
    const createBins = () => [
      { label: '-1.0 to -0.1', min: -Infinity, max: -0.1, count: 0, sum: 0 },
      { label: '-0.1 to -0.05', min: -0.1, max: -0.05, count: 0, sum: 0 },
      { label: '-0.05 to -0.01', min: -0.05, max: -0.01, count: 0, sum: 0 },
      { label: '-0.01 to -0.001', min: -0.01, max: -0.001, count: 0, sum: 0 },
      { label: '-0.001 to 0', min: -0.001, max: 0, count: 0, sum: 0 },
      { label: '0 to 0.001', min: 0, max: 0.001, count: 0, sum: 0 },
      { label: '0.001 to 0.01', min: 0.001, max: 0.01, count: 0, sum: 0 },
      { label: '0.01 to 0.05', min: 0.01, max: 0.05, count: 0, sum: 0 },
      { label: '0.05 to 0.1', min: 0.05, max: 0.1, count: 0, sum: 0 },
      { label: '0.1 to 1.0+', min: 0.1, max: Infinity, count: 0, sum: 0 }
    ];
    
    // Create lookup maps for fast matching
    const rsidMap = new Map();
    const posMap = new Map();
    
    userDNA.forEach(snp => {
      const genotype = snp.allele1 + snp.allele2;
      if (snp.rsid) rsidMap.set(snp.rsid, genotype);
      if (snp.chromosome && snp.position) {
        posMap.set(`${snp.chromosome}:${snp.position}`, genotype);
      }
    });
    
    Debug.log(2, 'BrowserGenomicProcessor', `Created lookup maps: ${rsidMap.size} rsids, ${posMap.size} positions`);
    
    let totalMatches = 0;
    const totalChunks = Math.ceil(totalVariants/CHUNK_SIZE);
    const pgsTopVariants = new Map(); // Track top variants per PGS
    
    // Process in chunks
    for (let offset = 0; offset < totalVariants; offset += CHUNK_SIZE) {
      const progress = 20 + (offset / totalVariants * 70);
      const chunkNum = Math.floor(offset/CHUNK_SIZE) + 1;
      
      progressCallback?.(`Processing batch ${chunkNum}/${totalChunks}...`, progress);
      const chunkResult = await this.conn.query(`
        SELECT pgs_id, variant_id, chr_name, chr_position, effect_allele, effect_weight 
        FROM trait_data 
        LIMIT ${CHUNK_SIZE} OFFSET ${offset}
      `);
      
      const chunkData = chunkResult.toArray();
      let chunkMatches = 0;
      
      for (const trait of chunkData) {
        // Initialize PGS tracking
        if (!pgsBreakdown.has(trait.pgs_id)) {
          pgsBreakdown.set(trait.pgs_id, { positive: 0, negative: 0, positiveSum: 0, negativeSum: 0, total: 0 });
          pgsDetails.set(trait.pgs_id, { topVariants: [], metadata: pgsMetadata[trait.pgs_id] || {} });
          pgsTopVariants.set(trait.pgs_id, []);
          pgsDistributions.set(trait.pgs_id, createBins());
        }
        pgsBreakdown.get(trait.pgs_id).total++;
        
        // Fast lookup
        let genotype = null;
        if (trait.variant_id && rsidMap.has(trait.variant_id)) {
          genotype = rsidMap.get(trait.variant_id);
        } else if (trait.chr_name && trait.chr_position) {
          const posKey = `${trait.chr_name}:${trait.chr_position}`;
          if (posMap.has(posKey)) {
            genotype = posMap.get(posKey);
          }
        }
        
        if (genotype && genotype.includes(trait.effect_allele)) {
          riskScore += trait.effect_weight;
          chunkMatches++;
          totalMatches++;
          
          const breakdown = pgsBreakdown.get(trait.pgs_id);
          if (trait.effect_weight > 0) {
            breakdown.positive++;
            breakdown.positiveSum += trait.effect_weight;
          } else {
            breakdown.negative++;
            breakdown.negativeSum += trait.effect_weight;
          }
          
          if (pgsMetadata[trait.pgs_id] && !breakdown.metadata) {
            breakdown.metadata = pgsMetadata[trait.pgs_id];
          }
          
          // Add to distribution bins
          const bins = pgsDistributions.get(trait.pgs_id);
          const bin = bins.find(b => trait.effect_weight > b.min && trait.effect_weight <= b.max);
          if (bin) {
            bin.count++;
            bin.sum += trait.effect_weight;
          }
          
          // Track top contributing variants (keep only top 20 per PGS)
          const topVariants = pgsTopVariants.get(trait.pgs_id);
          topVariants.push({
            rsid: trait.variant_id,
            effect_allele: trait.effect_allele,
            effect_weight: trait.effect_weight,
            userGenotype: genotype
          });
          
          // Keep only top 20 by absolute effect weight
          if (topVariants.length > 20) {
            topVariants.sort((a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight));
            topVariants.splice(20);
          }
        }
      }
      
      if (chunkNum % 25 === 0 || chunkNum === totalChunks) {
        Debug.log(2, 'BrowserGenomicProcessor', `Chunk ${chunkNum}: ${chunkMatches} matches, running total: ${totalMatches}, score: ${riskScore.toFixed(6)}`);
      }
      
      // Yield control periodically
      if (chunkNum % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    progressCallback?.('Finalizing...', 95);
    
    // Finalize top variants and distributions for each PGS
    for (const [pgsId, topVariants] of pgsTopVariants) {
      topVariants.sort((a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight));
      const pgsDetail = pgsDetails.get(pgsId);
      pgsDetail.topVariants = topVariants.slice(0, 20);
      pgsDetail.distribution = pgsDistributions.get(pgsId);
    }
    
    // Clean up
    await this.conn.query('DROP TABLE IF EXISTS trait_data');
    rsidMap.clear();
    posMap.clear();
    pgsTopVariants.clear();
    pgsDistributions.clear();
    
    const pgsCount = pgsBreakdown.size;
    Debug.log(1, 'BrowserGenomicProcessor', `Risk calculation complete: score=${riskScore.toFixed(6)}, matches=${totalMatches}, PGS_scores=${pgsCount}`);
    progressCallback?.('Complete', 100);
    
    return { 
      riskScore, 
      pgsBreakdown: Object.fromEntries(pgsBreakdown), 
      pgsDetails: Object.fromEntries(pgsDetails) 
    };
  }

  async loadParquet(url, tableName) {
    // Convert relative URLs to absolute for DuckDB worker
    const absoluteUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
    await this.conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM '${absoluteUrl}'`);
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