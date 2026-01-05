/**
 * Streaming utilities for memory-efficient parquet processing
 */

export class StreamingProcessor {
  constructor(conn, config = {}) {
    this.conn = conn;
    this.config = {
      chunkSize: config.chunkSize || 5000,
      memoryThreshold: config.memoryThreshold || 0.8, // 80% memory usage threshold
      yieldInterval: config.yieldInterval || 5,
      ...config
    };
  }

  /**
   * Process parquet file in streaming chunks with memory monitoring
   */
  async processParquetStream(parquetUrl, processor, progressCallback) {
    const absoluteUrl = parquetUrl.startsWith('/') ? `${window.location.origin}${parquetUrl}` : parquetUrl;
    
    // Get total count efficiently with force download
    const countResult = await this.conn.query(`SELECT COUNT(*) as total FROM '${absoluteUrl}'`);
    const totalRows = Number(countResult.toArray()[0].total);
    
    const totalChunks = Math.ceil(totalRows / this.config.chunkSize);
    let processedRows = 0;
    
    for (let offset = 0; offset < totalRows; offset += this.config.chunkSize) {
      const chunkNum = Math.floor(offset / this.config.chunkSize) + 1;
      const progress = (offset / totalRows) * 100;
      
      progressCallback?.(`Processing chunk ${chunkNum}/${totalChunks}`, progress);
      
      // Stream query directly from parquet without creating tables
      const chunkResult = await this.conn.query(`
        SELECT * FROM '${absoluteUrl}' 
        LIMIT ${this.config.chunkSize} OFFSET ${offset}
      `);
      
      const chunkData = chunkResult.toArray();
      await processor(chunkData, chunkNum, totalChunks);
      
      processedRows += chunkData.length;
      
      // Memory management and yielding
      if (chunkNum % this.config.yieldInterval === 0) {
        await this.yieldControl();
        await this.checkMemoryPressure();
      }
    }
    
    return processedRows;
  }

  /**
   * Monitor memory usage and trigger cleanup if needed
   */
  async checkMemoryPressure() {
    if ('memory' in performance) {
      const memInfo = performance.memory;
      const usageRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
      
      if (usageRatio > this.config.memoryThreshold) {
        console.warn(`High memory usage detected: ${(usageRatio * 100).toFixed(1)}%`);
        
        // Force garbage collection if available
        if (window.gc) {
          window.gc();
        }
        
        // Additional cleanup delay
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  /**
   * Yield control to prevent UI blocking
   */
  async yieldControl() {
    return new Promise(resolve => setTimeout(resolve, 1));
  }

  /**
   * Create optimized lookup structures for DNA matching
   */
  createDNALookup(userDNA) {
    const rsidMap = new Map();
    const posMap = new Map();
    
    for (const snp of userDNA) {
      const genotype = snp.allele1 + snp.allele2;
      
      if (snp.rsid) {
        rsidMap.set(snp.rsid, genotype);
      }
      
      if (snp.chromosome && snp.position) {
        posMap.set(`${snp.chromosome}:${snp.position}`, genotype);
      }
    }
    
    return { rsidMap, posMap };
  }

  /**
   * Efficient variant matching with fallback strategies
   */
  matchVariant(variantId, rsidMap, posMap) {
    // Direct rsid match
    if (rsidMap.has(variantId)) {
      return rsidMap.get(variantId);
    }
    
    // Position-based match for chr:pos:ref:alt format
    if (variantId.includes(':')) {
      const parts = variantId.split(':');
      if (parts.length >= 2) {
        const posKey = `${parts[0]}:${parts[1]}`;
        if (posMap.has(posKey)) {
          return posMap.get(posKey);
        }
      }
    }
    
    return null;
  }

  /**
   * Maintain top N items efficiently
   */
  maintainTopN(array, item, n, compareFn) {
    array.push(item);
    
    if (array.length > n) {
      array.sort(compareFn);
      array.splice(n);
    }
  }
}

/**
 * Memory-efficient aggregator for PGS calculations
 */
export class PGSAggregator {
  constructor() {
    this.pgsBreakdown = new Map();
    this.pgsDetails = new Map();
    this.pgsTopVariants = new Map();
    this.totalScore = 0;
    this.totalMatches = 0;
  }

  initializePGS(pgsId, metadata = {}) {
    if (!this.pgsBreakdown.has(pgsId)) {
      this.pgsBreakdown.set(pgsId, {
        positive: 0,
        negative: 0,
        positiveSum: 0,
        negativeSum: 0,
        total: 0
      });
      
      this.pgsDetails.set(pgsId, {
        topVariants: [],
        metadata
      });
      
      this.pgsTopVariants.set(pgsId, []);
    }
  }

  addVariant(pgsId, variant, genotype, effectWeight) {
    const breakdown = this.pgsBreakdown.get(pgsId);
    breakdown.total++;
    
    if (effectWeight > 0) {
      breakdown.positive++;
      breakdown.positiveSum += effectWeight;
    } else {
      breakdown.negative++;
      breakdown.negativeSum += effectWeight;
    }
    
    this.totalScore += effectWeight;
    this.totalMatches++;
    
    // Track top variants
    const topVariants = this.pgsTopVariants.get(pgsId);
    const variantData = {
      rsid: variant.variant_id,
      effect_allele: variant.effect_allele,
      effect_weight: effectWeight,
      userGenotype: genotype
    };
    
    if (topVariants.length < 20) {
      topVariants.push(variantData);
    } else {
      // Replace lowest impact variant if this one is higher
      const minIndex = topVariants.reduce((minIdx, curr, idx, arr) => 
        Math.abs(curr.effect_weight) < Math.abs(arr[minIdx].effect_weight) ? idx : minIdx, 0);
      
      if (Math.abs(effectWeight) > Math.abs(topVariants[minIndex].effect_weight)) {
        topVariants[minIndex] = variantData;
      }
    }
  }

  finalize() {
    // Sort top variants for each PGS
    for (const [pgsId, topVariants] of this.pgsTopVariants) {
      topVariants.sort((a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight));
      this.pgsDetails.get(pgsId).topVariants = topVariants;
    }
    
    return {
      riskScore: this.totalScore,
      totalMatches: this.totalMatches,
      pgsBreakdown: Object.fromEntries(this.pgsBreakdown),
      pgsDetails: Object.fromEntries(this.pgsDetails)
    };
  }

  cleanup() {
    this.pgsBreakdown.clear();
    this.pgsDetails.clear();
    this.pgsTopVariants.clear();
  }
}