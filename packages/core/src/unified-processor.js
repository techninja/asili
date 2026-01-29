/**
 * Unified processor that works in both browser and server environments
 * Provides a consistent API while handling platform-specific implementations
 */

import { Debug } from './utils/debug.js';
import { PATHS } from './constants/paths.js';
// import { DuckDBCacheManager } from '../cache/duckdb-manager.js';

export class UnifiedProcessor {
  constructor(genomicProcessor, storage, progressTracker, queueManager, config = {}) {
    this.genomicProcessor = genomicProcessor;
    this.storage = storage;
    this.progressTracker = progressTracker;
    this.queueManager = queueManager;
    this.config = config;
    this.cacheManager = null;
    this.traitManifest = null;
    this.listeners = new Set();
    this.dnaCache = new Map(); // Cache loaded DNA per individual
  }

  async initialize() {
    // Initialize all components
    if (this.genomicProcessor.initialize) {
      await this.genomicProcessor.initialize();
    }
    if (this.storage.initialize) {
      await this.storage.initialize();
    }
    
    // Initialize DuckDB cache manager (disabled for now)
    // this.cacheManager = new DuckDBCacheManager(this.genomicProcessor, {
    //   cacheDir: './cache',
    //   cacheUrl: '/cache'
    // });
    // await this.cacheManager.initialize();
    
    // Load trait manifest
    await this.loadTraitManifest();
    
    Debug.log(1, 'UnifiedProcessor', 'Initialized successfully');
  }

  async loadTraitManifest() {
    try {
      let manifestData;
      
      if (typeof window !== 'undefined') {
        // Browser environment
        const response = await fetch('/data/trait_manifest.json');
        manifestData = await response.json();
      } else {
        // Server environment
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const manifestPath = PATHS.TRAIT_MANIFEST;
        
        Debug.log(2, 'UnifiedProcessor', `Loading trait manifest from: ${manifestPath}`);
        const content = await fs.readFile(manifestPath, 'utf8');
        manifestData = JSON.parse(content);
      }
      
      this.traitManifest = manifestData;
      Debug.log(2, 'UnifiedProcessor', `Loaded ${Object.keys(manifestData.traits).length} traits`);
      
    } catch (error) {
      Debug.log(1, 'UnifiedProcessor', 'Failed to load trait manifest:', error);
      this.traitManifest = { traits: {} };
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ event, data, timestamp: Date.now() });
      } catch (error) {
        Debug.log(1, 'UnifiedProcessor', 'Listener error:', error);
      }
    });
  }

  // DNA import and processing
  async importDNA(dnaFile, individualId, individualName, emoji = '👤', progressCallback) {
    Debug.log(1, 'UnifiedProcessor', `Importing DNA for ${individualName} (${individualId})`);
    
    try {
      // Add individual if not exists
      if (individualId && individualName) {
        await this.storage.addIndividual(individualId, individualName, 'self', emoji);
      }

      // Parse DNA file
      const dnaData = await this.parseDNAFile(dnaFile, individualId, progressCallback);
      
      this.emit('dnaImported', {
        individualId,
        variantCount: dnaData.variants.length,
        metadata: dnaData.metadata
      });

      return {
        individualId,
        variantCount: dnaData.variants.length,
        metadata: dnaData.metadata
      };
      
    } catch (error) {
      this.emit('dnaImportFailed', { individualId, error: error.message });
      throw error;
    }
  }

  async parseDNAFile(file, individualId, progressCallback) {
    Debug.log(1, 'UnifiedProcessor', `Parsing DNA file: ${file.name || 'uploaded file'}`);
    
    let text;
    if (typeof file === 'string') {
      // Server: file is a path
      const fs = await import('fs/promises');
      text = await fs.readFile(file, 'utf8');
    } else {
      // Browser: file is a File object
      text = await file.text();
    }

    const lines = text.split('\n');
    const dataLines = lines.filter(
      line => line.trim() && !line.startsWith('#') && !line.startsWith('rsid')
    );

    Debug.log(2, 'UnifiedProcessor', `Found ${dataLines.length} data lines from ${lines.length} total lines`);

    const variants = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;

      const columns = line.split('\t');
      if (columns.length >= 4) {
        const position = parseInt(columns[2], 10);
        if (!isNaN(position)) {
          const genotype = columns[3].trim();
          if (genotype !== '--' && genotype !== '00') {
            variants.push({
              rsid: columns[0].trim(),
              chromosome: columns[1].trim(),
              position,
              allele1: genotype[0] || '',
              allele2: genotype[1] || genotype[0] || ''
            });
          }
        }
      }

      // Update progress periodically
      if (i % 10000 === 0) {
        const progress = Math.round((i / dataLines.length) * 100);
        const message = `Parsed ${variants.length} variants`;
        progressCallback?.(message, progress);
      }
    }

    Debug.log(1, 'UnifiedProcessor', `Parsed ${variants.length} valid variants from DNA file`);

    // Store variants
    if (individualId) {
      Debug.log(2, 'UnifiedProcessor', `Storing variants for individual: ${individualId}`);
      await this.storage.storeVariants(individualId, variants, (current, total) => {
        const progress = Math.round((current / total) * 100);
        const message = `Stored ${current}/${total} variants`;
        progressCallback?.(message, progress);
      });
    }

    return {
      format: 'generic',
      variants,
      metadata: {
        filename: file.name || 'uploaded_file',
        size: file.size || text.length,
        variantCount: variants.length,
        parsedAt: new Date().toISOString()
      }
    };
  }

  // Risk calculation
  async calculateTraitRisk(traitId, individualId, progressCallback) {
    Debug.log(1, 'UnifiedProcessor', `Calculating risk for trait: ${traitId}, individual: ${individualId}`);

    if (!this.traitManifest) {
      throw new Error('Trait manifest not loaded');
    }

    try {
      // Get trait information
      const trait = this.traitManifest.traits[traitId];
      if (!trait) {
        throw new Error(`Trait ${traitId} not found`);
      }

      Debug.log(2, 'UnifiedProcessor', `Found trait: ${trait.name} with ${trait.variant_count} variants`);

      if (!trait.file_path) {
        throw new Error(`No data file available for trait ${trait.name}`);
      }

      // Get user DNA data (with caching)
      progressCallback?.('Loading user DNA...', 0);
      let userDNA = this.dnaCache.get(individualId);
      if (!userDNA) {
        userDNA = await this.storage.getVariants(individualId);
        if (!userDNA || userDNA.length === 0) {
          throw new Error('No DNA data found for individual');
        }
        this.dnaCache.set(individualId, userDNA);
        console.log(`🧬 Loaded ${userDNA.length} DNA variants for processing`);
      }

      // Build trait URL/path
      progressCallback?.('Loading trait data...', 5);
      let traitSource;
      
      if (typeof window !== 'undefined') {
        // Browser: use URL
        traitSource = PATHS.getWebTraitFile(traitId);
      } else {
        // Server: use file path
        traitSource = PATHS.getTraitFile(traitId);
      }

      Debug.log(2, 'UnifiedProcessor', `Using trait data source: ${traitSource}`);

      // Extract normalization parameters from pgs_ids
      const normalizationParams = {};
      if (trait.pgs_ids) {
        trait.pgs_ids.forEach(pgs => {
          if (typeof pgs === 'object' && pgs.id) {
            normalizationParams[pgs.id] = {
              norm_mean: pgs.norm_mean || 0,
              norm_sd: pgs.norm_sd || null
            };
          }
        });
      }

      // Calculate risk using genomic processor
      const result = await this.genomicProcessor.calculateRisk(
        traitSource,
        userDNA,
        (message, percent) => {
          Debug.log(3, 'UnifiedProcessor', `Risk calculation progress: ${message} (${percent}%)`);
          progressCallback?.(message, percent);
        },
        trait.pgs_metadata,
        normalizationParams
      );

      Debug.log(1, 'UnifiedProcessor', `Risk calculation complete. Score: ${result.riskScore}`);

      // Format and cache result
      const riskData = {
        riskScore: result.riskScore,
        zScore: result.zScore,
        pgsBreakdown: result.pgsBreakdown,
        pgsDetails: result.pgsDetails,
        matchedVariants: result.totalMatches || 0,
        totalVariants: trait.variant_count,
        traitLastUpdated: trait.last_updated,
        calculatedAt: new Date().toISOString()
      };

      // Cache the result using traditional storage
      await this.storage.storeRiskScore(individualId, traitId, riskData);

      this.emit('traitCompleted', {
        traitId,
        individualId,
        riskScore: riskData.riskScore,
        matchedVariants: riskData.matchedVariants
      });

      return riskData;

    } catch (error) {
      Debug.log(1, 'UnifiedProcessor', `Risk calculation failed for ${traitId}:`, error.message);
      this.emit('traitFailed', { traitId, individualId, error: error.message });
      throw error;
    }
  }

  // Batch processing
  async processAllTraits(individualId, options = {}) {
    const traits = Object.keys(this.traitManifest.traits);
    const totalTraits = traits.length;
    const results = [];
    
    Debug.log(1, 'UnifiedProcessor', `Starting batch processing of ${totalTraits} traits for ${individualId}`);
    
    this.emit('batchStarted', { individualId, totalTraits });
    
    const batchSize = options.batchSize || 1;
    const yieldInterval = options.yieldInterval || 5;
    
    for (let i = 0; i < traits.length; i += batchSize) {
      const batch = traits.slice(i, i + batchSize);
      const overallProgress = (i / totalTraits) * 100;
      
      for (const traitId of batch) {
        const trait = this.traitManifest.traits[traitId];
        
        this.emit('progress', {
          progress: overallProgress,
          processedTraits: i,
          totalTraits,
          currentTrait: trait
        });
        
        try {
          const result = await this.calculateTraitRisk(
            traitId,
            individualId,
            (message, percent) => {
              const adjustedProgress = overallProgress + (percent / totalTraits);
              // Don't emit every progress update to avoid spam
            }
          );
          
          results.push({ traitId, success: true, data: result });
          
        } catch (error) {
          Debug.log(2, 'UnifiedProcessor', `Failed to process trait ${traitId}:`, error.message);
          results.push({ traitId, success: false, error: error.message });
        }
      }
      
      // Yield control periodically
      if (i % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    Debug.log(1, 'UnifiedProcessor', `Batch processing complete: ${successCount} success, ${failedCount} failed`);
    
    this.emit('batchCompleted', {
      individualId,
      totalTraits,
      successCount,
      failedCount,
      results
    });
    
    return results;
  }

  // Queue integration
  async queueAllTraits(individualId, priority = 2) {
    if (!this.queueManager) {
      throw new Error('Queue manager not available');
    }

    const traits = Object.entries(this.traitManifest.traits).map(([id, trait]) => ({
      id,
      ...trait
    }));

    return this.queueManager.addAllTraits(individualId, traits, priority);
  }

  async queueSingleTrait(traitId, individualId, priority = 3) {
    if (!this.queueManager) {
      throw new Error('Queue manager not available');
    }

    const trait = this.traitManifest.traits[traitId];
    if (!trait) {
      throw new Error(`Trait ${traitId} not found`);
    }

    return this.queueManager.add(traitId, individualId, priority, trait);
  }

  // Data access - prioritize DuckDB cache
  async getCachedResults(individualId) {
    if (this.cacheManager) {
      try {
        return await this.cacheManager.getCachedResults(individualId);
      } catch (error) {
        Debug.log(2, 'UnifiedProcessor', 'DuckDB cache failed, falling back to storage:', error.message);
      }
    }
    
    // Fallback to storage manager
    if (this.storage.getCachedResults) {
      return await this.storage.getCachedResults(individualId);
    } else {
      // Browser storage - build from individual calls
      const keys = await this.storage.list();
      const resultKeys = keys.filter(
        key => key.startsWith('risk_') && key.endsWith(`_${individualId}`)
      );

      const results = [];
      for (const key of resultKeys) {
        const data = await this.storage.retrieve(key);
        if (data) {
          const traitId = key.replace('risk_', '').replace(`_${individualId}`, '');
          results.push({ traitId, ...data });
        }
      }
      return results;
    }
  }

  async getCachedResult(individualId, traitId) {
    if (this.cacheManager) {
      try {
        const result = await this.cacheManager.getCachedResult(individualId, traitId);
        if (result) return result;
      } catch (error) {
        Debug.log(2, 'UnifiedProcessor', 'DuckDB cache failed, falling back to storage:', error.message);
      }
    }
    
    return await this.storage.getCachedRiskScore(individualId, traitId);
  }

  // Utility methods
  getAllTraits() {
    if (!this.traitManifest) return [];
    
    return Object.entries(this.traitManifest.traits).map(([id, trait]) => ({
      id,
      name: trait.name,
      description: trait.description || `Polygenic risk score for ${trait.name}`,
      categories: trait.categories || ['Other Conditions'],
      file_path: trait.file_path,
      pgs_metadata: trait.pgs_metadata || {},
      variant_count: trait.variant_count || 0,
      last_updated: trait.last_updated
    }));
  }

  getTraitCategories() {
    const categories = new Set();
    this.getAllTraits().forEach(trait => {
      trait.categories?.forEach(cat => categories.add(cat));
    });
    return Array.from(categories).sort();
  }

  getTraitsForCategory(categoryName) {
    return this.getAllTraits().filter(trait =>
      trait.categories?.includes(categoryName)
    );
  }

  // Status and control
  getStatus() {
    return {
      initialized: !!this.traitManifest,
      traitCount: this.traitManifest ? Object.keys(this.traitManifest.traits).length : 0,
      queueStatus: this.queueManager ? this.queueManager.getQueueState() : null,
      cacheEnabled: !!this.cacheManager
    };
  }

  // Cache management
  async clearCache(individualId = null) {
    if (this.cacheManager) {
      await this.cacheManager.clearCache(individualId);
    }
    
    // Also clear traditional storage
    if (individualId) {
      if (this.storage.deleteIndividual) {
        await this.storage.deleteIndividual(individualId);
      }
    } else {
      if (this.storage.clearCache) {
        await this.storage.clearCache();
      } else if (this.storage.clear) {
        await this.storage.clear();
      }
    }
  }

  async exportCache(format = 'parquet') {
    if (this.cacheManager) {
      return await this.cacheManager.exportCache(format);
    }
    throw new Error('Cache manager not available');
  }

  async getCacheStats() {
    if (this.cacheManager) {
      return await this.cacheManager.getCacheStats();
    }
    return null;
  }

  async cleanup() {
    this.dnaCache.clear();
    if (this.cacheManager) {
      await this.cacheManager.cleanup();
    }
    if (this.genomicProcessor.cleanup) {
      await this.genomicProcessor.cleanup();
    }
    if (this.storage.cleanup) {
      await this.storage.cleanup();
    }
    this.listeners.clear();
  }
}

// Factory functions for different environments
export async function createBrowserProcessor(config = {}) {
  const { ProgressTracker } = await import('./progress/index.js');
  const { BrowserGenomicProcessor } = await import('./genomic-processor/browser.js');
  const { BrowserStorageManager } = await import('./storage-manager/browser.js');
  const { QueueManager } = await import('./queue/manager.js');

  const progressTracker = new ProgressTracker();
  const genomicProcessor = new BrowserGenomicProcessor(config, progressTracker);
  const storage = new BrowserStorageManager(config);
  const queueManager = new QueueManager({ calculateTraitRisk: async (traitId, individualId, progressCallback) => {
    const processor = new UnifiedProcessor(genomicProcessor, storage, progressTracker, null, config);
    await processor.initialize();
    return await processor.calculateTraitRisk(traitId, individualId, progressCallback);
  }});

  const processor = new UnifiedProcessor(genomicProcessor, storage, progressTracker, queueManager, config);
  await processor.initialize();

  return { processor, progressTracker, genomicProcessor, storage, queueManager };
}

export async function createServerProcessor(config = {}) {
  const { ProgressTracker } = await import('./progress/index.js');
  const { ServerGenomicProcessor } = await import('./genomic-processor/server.js');
  const { ServerStorageManager } = await import('./storage-manager/server.js');
  const { QueueManager } = await import('./queue/manager.js');

  const progressTracker = new ProgressTracker();
  const genomicProcessor = new ServerGenomicProcessor(config, progressTracker);
  const storage = new ServerStorageManager(config);
  const queueManager = new QueueManager({ calculateTraitRisk: async (traitId, individualId, progressCallback) => {
    const processor = new UnifiedProcessor(genomicProcessor, storage, progressTracker, null, config);
    await processor.initialize();
    return await processor.calculateTraitRisk(traitId, individualId, progressCallback);
  }});

  const processor = new UnifiedProcessor(genomicProcessor, storage, progressTracker, queueManager, config);
  await processor.initialize();

  return { processor, progressTracker, genomicProcessor, storage, queueManager };
}

// Auto-detecting factory
export async function createProcessor(config = {}) {
  if (typeof window !== 'undefined') {
    return await createBrowserProcessor(config);
  } else {
    return await createServerProcessor(config);
  }
}