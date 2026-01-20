/**
 * Browser-only unified processor without Node.js imports
 * Provides a consistent API for browser environments only
 */

import { Debug } from './utils/debug.js';

export class UnifiedProcessor {
  constructor(genomicProcessor, storage, progressTracker, queueManager) {
    this.genomicProcessor = genomicProcessor;
    this.storage = storage;
    this.progressTracker = progressTracker;
    this.queueManager = queueManager;
    this.cacheManager = null;
    this.traitManifest = null;
    this.listeners = new Set();
  }

  async initialize() {
    if (this.genomicProcessor.initialize) {
      await this.genomicProcessor.initialize();
    }
    if (this.storage.initialize) {
      await this.storage.initialize();
    }
    
    await this.loadTraitManifest();
    Debug.log(1, 'UnifiedProcessor', 'Initialized successfully');
  }

  async loadTraitManifest() {
    try {
      const { TraitManifestLoader } = await import('./trait-manifest-loader.js');
      const loader = new TraitManifestLoader(this.genomicProcessor.conn);
      
      this.traitManifest = { traits: {} };
      
      Debug.log(3, 'UnifiedProcessor', 'Starting trait streaming...');
      
      for await (const batch of loader.streamTraits('/data/trait_manifest.db', 50)) {
        this.traitManifest.traits = loader.getTraits();
        // Emit immediately after each batch
        Debug.log(3, 'UnifiedProcessor', `Emitting traitsLoaded event with ${batch.loaded} traits, ${this.listeners.size} listeners`);
        this.emit('traitsLoaded', { 
          loaded: batch.loaded,
          traits: this.getAllTraits()
        });
      }
      
      Debug.log(2, 'UnifiedProcessor', `Loaded ${Object.keys(this.traitManifest.traits).length} traits from DB`);
    } catch (error) {
      Debug.log(1, 'UnifiedProcessor', 'DB streaming failed, falling back to JSON:', error);
      try {
        const response = await fetch('/data/trait_manifest.json');
        this.traitManifest = await response.json();
        this.emit('traitsLoaded', { 
          loaded: Object.keys(this.traitManifest.traits).length,
          traits: this.getAllTraits()
        });
        Debug.log(2, 'UnifiedProcessor', `Loaded ${Object.keys(this.traitManifest.traits).length} traits from JSON`);
      } catch (jsonError) {
        Debug.log(1, 'UnifiedProcessor', 'Failed to load trait manifest:', jsonError);
        this.traitManifest = { traits: {} };
      }
    }
  }

  subscribe(callback) {
    Debug.log(3, 'UnifiedProcessor', `Adding listener (total: ${this.listeners.size + 1})`);
    this.listeners.add(callback);
    return () => {
      Debug.log(3, 'UnifiedProcessor', `Removing listener (remaining: ${this.listeners.size - 1})`);
      this.listeners.delete(callback);
    };
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

  async importDNA(dnaFile, individualId, individualName, emoji = '👤', progressCallback) {
    Debug.log(1, 'UnifiedProcessor', `Importing DNA for ${individualName} (${individualId})`);
    
    try {
      if (individualId && individualName) {
        await this.storage.addIndividual(individualId, individualName, 'self', emoji);
      }

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
    
    const text = await file.text();
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

      if (i % 10000 === 0) {
        const progress = Math.round((i / dataLines.length) * 100);
        const message = `Parsed ${variants.length} variants`;
        progressCallback?.(message, progress);
      }
    }

    Debug.log(1, 'UnifiedProcessor', `Parsed ${variants.length} valid variants from DNA file`);

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

  async calculateTraitRisk(traitId, individualId, progressCallback) {
    Debug.log(1, 'UnifiedProcessor', `Calculating risk for trait: ${traitId}, individual: ${individualId}`);

    if (!this.traitManifest) {
      throw new Error('Trait manifest not loaded');
    }

    try {
      const trait = this.traitManifest.traits[traitId];
      if (!trait) {
        throw new Error(`Trait ${traitId} not found`);
      }

      Debug.log(2, 'UnifiedProcessor', `Found trait: ${trait.name} with ${trait.variant_count} variants`);

      if (!trait.file_path) {
        throw new Error(`No data file available for trait ${trait.name}`);
      }

      progressCallback?.('Loading user DNA...', 0);
      const userDNA = await this.storage.getVariants(individualId);
      if (!userDNA || userDNA.length === 0) {
        throw new Error('No DNA data found for individual');
      }

      Debug.log(2, 'UnifiedProcessor', `Loaded ${userDNA.length} DNA variants for processing`);

      progressCallback?.('Loading trait data...', 5);
      const traitSource = `/data/packs/${trait.file_path}`;

      Debug.log(2, 'UnifiedProcessor', `Using trait data source: ${traitSource}`);

      const result = await this.genomicProcessor.calculateRisk(
        traitSource,
        userDNA,
        (message, percent) => {
          Debug.log(3, 'UnifiedProcessor', `Risk calculation progress: ${message} (${percent}%)`);
          progressCallback?.(message, percent);
        },
        trait.pgs_metadata
      );

      Debug.log(1, 'UnifiedProcessor', `Risk calculation complete. Score: ${result.riskScore}`);

      const riskData = {
        riskScore: result.riskScore,
        pgsBreakdown: result.pgsBreakdown,
        pgsDetails: result.pgsDetails,
        matchedVariants: result.totalMatches || userDNA.length,
        totalVariants: trait.variant_count,
        traitLastUpdated: trait.last_updated,
        calculatedAt: new Date().toISOString()
      };

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
            }
          );
          
          results.push({ traitId, success: true, data: result });
          
        } catch (error) {
          Debug.log(2, 'UnifiedProcessor', `Failed to process trait ${traitId}:`, error.message);
          results.push({ traitId, success: false, error: error.message });
        }
      }
      
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

  async getCachedResults(individualId) {
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

  async getCachedResult(individualId, traitId) {
    return await this.storage.getCachedRiskScore(individualId, traitId);
  }

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

  getStatus() {
    return {
      initialized: !!this.traitManifest,
      traitCount: this.traitManifest ? Object.keys(this.traitManifest.traits).length : 0,
      queueStatus: this.queueManager ? this.queueManager.getQueueState() : null,
      cacheEnabled: !!this.cacheManager
    };
  }

  async clearCache(individualId = null) {
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

  async cleanup() {
    if (this.genomicProcessor.cleanup) {
      await this.genomicProcessor.cleanup();
    }
    if (this.storage.cleanup) {
      await this.storage.cleanup();
    }
    this.listeners.clear();
  }
}

// Browser-only factory function
export async function createBrowserProcessor(config = {}) {
  const { ProgressTracker } = await import('./progress/index.js');
  const { BrowserGenomicProcessor } = await import('./genomic-processor/browser.js');
  const { BrowserStorageManager } = await import('./storage-manager/browser.js');
  const { QueueManager } = await import('./queue/manager.js');

  const progressTracker = new ProgressTracker();
  const genomicProcessor = new BrowserGenomicProcessor(config, progressTracker);
  const storage = new BrowserStorageManager(config);
  const queueManager = new QueueManager({ calculateTraitRisk: async (traitId, individualId, progressCallback) => {
    return await processor.calculateTraitRisk(traitId, individualId, progressCallback);
  }});

  const processor = new UnifiedProcessor(genomicProcessor, storage, progressTracker, queueManager);
  // DON'T initialize here - let caller set up subscriptions first
  Debug.log(2, 'createBrowserProcessor', 'Processor created, NOT initialized yet');

  // Set processor reference in queueManager
  queueManager.processor = processor;

  return { processor, progressTracker, genomicProcessor, storage, queueManager };
}