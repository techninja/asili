/**
 * Integration example showing how to use @asili/core in the web app
 * This demonstrates the unified progress tracking and genomic processing
 */

import { createBrowserProcessor } from '@asili/core/unified-processor-browser.js';
import { Debug } from '@asili/debug';

export class AsiliProcessor {
  constructor() {
    this.unifiedProcessor = null;
    this.progressTracker = null;
    this.queueManager = null;
    this.progressListeners = new Set();
  }

  async initialize() {
    // Create browser processor
    const { processor, progressTracker, queueManager } = await createBrowserProcessor({
      cacheSize: '256MB',
      enableOptimizations: true,
      dbName: 'asili-genomic-data',
      version: 1
    });

    this.unifiedProcessor = processor;
    this.progressTracker = progressTracker;
    this.queueManager = queueManager;

    // Subscribe to progress updates
    this.progressTracker.subscribe(status => {
      this.progressListeners.forEach(listener => listener(status));
    });

    // Subscribe to processor events
    this.unifiedProcessor.subscribe(event => {
      Debug.log(3, 'AsiliProcessor', `Forwarding event: ${event.event}`, event.data);
      this.progressListeners.forEach(listener => listener(event));
    });
    
    // NOW initialize the processor (will trigger streaming events)
    Debug.log(2, 'AsiliProcessor', 'Initializing unified processor');
    await this.unifiedProcessor.initialize();
  }

  // Get available trait categories
  getTraitCategories() {
    return this.unifiedProcessor?.getTraitCategories() || [];
  }

  // Get traits for a specific category
  getTraitsForCategory(categoryName) {
    return this.unifiedProcessor?.getTraitsForCategory(categoryName) || [];
  }

  // Get all available traits
  getAllTraits() {
    return this.unifiedProcessor?.getAllTraits() || [];
  }

  // Subscribe to progress updates
  onProgress(callback) {
    Debug.log(3, 'AsiliProcessor', `Adding progress listener (total: ${this.progressListeners.size + 1})`);
    this.progressListeners.add(callback);
    return () => {
      Debug.log(3, 'AsiliProcessor', `Removing progress listener (remaining: ${this.progressListeners.size - 1})`);
      this.progressListeners.delete(callback);
    };
  }

  // Import DNA file and store variants
  async importDNA(
    dnaFile,
    individualId,
    individualName,
    emoji = '👤',
    progressCallback
  ) {
    if (!this.unifiedProcessor) {
      throw new Error('Processor not initialized');
    }

    return await this.unifiedProcessor.importDNA(
      dnaFile,
      individualId,
      individualName,
      emoji,
      progressCallback
    );
  }

  // Calculate risk for a single trait using real DNA processing
  async calculateTraitRisk(traitId, individualId, progressCallback) {
    if (!this.unifiedProcessor) {
      throw new Error('Processor not initialized');
    }

    return await this.unifiedProcessor.calculateTraitRisk(
      traitId,
      individualId,
      progressCallback
    );
  }



  // Get cached results
  async getCachedResults(individualId) {
    return await this.unifiedProcessor?.getCachedResults(individualId) || [];
  }

  // Get cached result for specific trait
  async getCachedResult(individualId, traitId) {
    return await this.unifiedProcessor?.getCachedResult(individualId, traitId);
  }

  // Clear cached results for individual
  async clearCachedResults(individualId) {
    // This would need to be implemented in the unified processor
    // For now, fall back to direct storage access if available
    if (this.unifiedProcessor?.storage?.deleteIndividual) {
      await this.unifiedProcessor.storage.deleteIndividual(individualId);
    }
  }

  // Clear all cached data
  async clearCache() {
    if (this.unifiedProcessor?.storage?.clearCache) {
      await this.unifiedProcessor.storage.clearCache();
    } else if (this.unifiedProcessor?.storage?.clear) {
      await this.unifiedProcessor.storage.clear();
    }
  }

  // Process all traits for an individual
  async processAllTraits(individualId, progressCallback) {
    if (!this.unifiedProcessor) {
      throw new Error('Processor not initialized');
    }

    return await this.unifiedProcessor.processAllTraits(individualId, {
      batchSize: 1,
      yieldInterval: 5
    });
  }

  // Cleanup resources
  async cleanup() {
    if (this.unifiedProcessor) {
      await this.unifiedProcessor.cleanup();
    }
    this.progressListeners.clear();
  }

  // Queue management methods
  getQueueManager() {
    return this.queueManager;
  }

  async queueAllTraits(individualId, priority = 2) {
    return await this.unifiedProcessor?.queueAllTraits(individualId, priority);
  }

  async queueSingleTrait(traitId, individualId, priority = 3) {
    return await this.unifiedProcessor?.queueSingleTrait(traitId, individualId, priority);
  }
}

// Example usage:
/*
const asili = new AsiliProcessor();
await asili.initialize();

// Subscribe to progress updates
asili.onProgress((status) => {
// Debug.log(1, 'AsiliProcessor', `Stage: ${status.stage}, Progress: ${status.progress}%, Message: ${status.message}`);
// Debug.log(1, 'AsiliProcessor', 'Risk scores:', results);
*/
