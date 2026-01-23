/**
 * Hybrid processor that switches between local and server processing
 * Based on settings configuration and server availability
 */

import { AsiliProcessor } from './asili-processor.js';
import { createServerClient } from './server-api-client.js';
import { getSettings } from './settings-loader.js';
import { WebSocketManager } from './websocket-manager.js';
import { ServerQueueManager } from './server-queue-manager.js';
import { TraitCacheManager } from './trait-cache-manager.js';
import { Debug } from '@asili/debug';
import { PATHS } from '@asili/core/constants/paths.js';

export class HybridProcessor {
  constructor() {
    this.settings = null;
    this.localProcessor = null;
    this.serverClient = null;
    this.wsManager = null;
    this.serverQueueManager = null;
    this.traitCache = new TraitCacheManager();
    this.mode = 'local';
    this.pendingCalculations = new Map();
  }

  async initialize() {
    this.settings = await getSettings();
    this.mode = this.settings.getMode();
    
    Debug.log(1, 'HybridProcessor', `Initializing in ${this.mode} mode`);

    if (this.settings.isServerProcessingEnabled()) {
      try {
        this.serverClient = await createServerClient(this.settings);
        this.wsManager = new WebSocketManager(this.serverClient.baseUrl);
        await this.wsManager.connect();
        this.serverQueueManager = new ServerQueueManager(this.wsManager);
        this.setupWebSocketListeners();
        Debug.log(2, 'HybridProcessor', 'Server client and WebSocket initialized');
      } catch (error) {
        Debug.log(1, 'HybridProcessor', 'Server client failed:', error.message);
        if (this.mode === 'server') {
          throw error;
        }
      }
    }
    
    if (!this.serverClient || this.mode === 'local') {
      this.localProcessor = new AsiliProcessor();
      await this.localProcessor.initialize();
      Debug.log(2, 'HybridProcessor', 'Local processor initialized');
    }
  }

  setupWebSocketListeners() {
    this.wsManager.on('result', (data) => {
      const key = `${data.traitId}_${data.individualId}`;
      const pending = this.pendingCalculations.get(key);
      if (pending) {
        this.pendingCalculations.delete(key);
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(new Error(data.error));
        }
      }
      
      // Sync new result to IndexedDB and update trait store immediately
      if (this.localProcessor?.unifiedProcessor?.storage && data.success) {
        this.localProcessor.unifiedProcessor.storage.storeRiskScore(
          data.individualId,
          data.traitId,
          data.data
        ).then(() => {
          // Import trait store and update immediately with the result
          import('./trait-store.js').then(({ useTraitStore }) => {
            useTraitStore.getState().setTraitCache(data.traitId, data.data);
            Debug.log(2, 'HybridProcessor', `Updated trait store for ${data.traitId}`);
          });
        }).catch(err => Debug.log(1, 'HybridProcessor', 'Failed to sync result to IndexedDB:', err));
      }
    });

    this.wsManager.on('progress', (data) => {
      const key = `${data.traitId}_${data.individualId}`;
      const pending = this.pendingCalculations.get(key);
      if (pending && pending.progressCallback) {
        pending.progressCallback(data.message, data.percent);
      }
    });

    // Forward WebSocket events to local queue manager if available
    this.wsManager.on('queue-updated', (data) => {
      if (this.localProcessor?.queueManager) {
        this.localProcessor.queueManager.emit('serverQueueUpdated', data);
      }
    });

    this.wsManager.on('job-started', (data) => {
      if (this.localProcessor?.queueManager) {
        this.localProcessor.queueManager.emit('serverJobStarted', data);
      }
    });
  }

  shouldUseServer(operation = 'default') {
    return !!this.serverClient;
  }

  async getAllTraits() {
    // Always use local processor for traits (even in server mode)
    if (!this.localProcessor) {
      Debug.log(1, 'HybridProcessor', 'Creating local processor for trait loading');
      this.localProcessor = new AsiliProcessor();
    }
    return this.localProcessor.getAllTraits() || [];
  }

  async getTraitCategories() {
    if (this.shouldUseServer()) {
      // For now, fall back to local processor for trait categories
      if (!this.localProcessor) {
        this.localProcessor = new AsiliProcessor();
        await this.localProcessor.initialize();
      }
      return this.localProcessor.getTraitCategories() || [];
    }
    return this.localProcessor?.getTraitCategories() || [];
  }

  getQueueManager() {
    if (this.shouldUseServer()) {
      return this.serverQueueManager;
    }
    return this.localProcessor?.getQueueManager() || null;
  }

  // Storage proxy methods
  get storage() {
    if (this.shouldUseServer()) {
      return {
        updateIndividual: async (id, updates) => {
          return await this.serverClient.request(`/individuals/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
          });
        },
        getIndividuals: async () => {
          return await this.serverClient.getIndividuals();
        },
        deleteIndividual: async (id) => {
          return await this.serverClient.deleteIndividual(id);
        }
      };
    } else {
      return this.localProcessor?.storage || null;
    }
  }

  async importDNA(dnaFile, individualId, individualName, emoji = '👤', progressCallback) {
    Debug.log(1, 'HybridProcessor', `importDNA called - shouldUseServer: ${this.shouldUseServer()}`);
    Debug.log(1, 'HybridProcessor', `serverClient available: ${!!this.serverClient}`);
    Debug.log(1, 'HybridProcessor', `localProcessor available: ${!!this.localProcessor}`);
    
    return await this.uploadDNA(dnaFile, individualId, individualName, emoji, progressCallback);
  }

  async uploadDNA(dnaFile, individualId, individualName, emoji = '👤', progressCallback) {
    if (this.shouldUseServer()) {
      Debug.log(1, 'HybridProcessor', 'Using server for DNA upload');
      return await this.serverClient.uploadDNA(dnaFile, individualId, individualName, emoji, progressCallback);
    } else {
      Debug.log(1, 'HybridProcessor', 'Using local processor for DNA upload');
      return await this.localProcessor.importDNA(dnaFile, individualId, individualName, emoji, progressCallback);
    }
  }

  async getCachedResult(individualId, traitId) {
    // Ensure local processor is initialized once
    if (!this.localProcessor) {
      Debug.log(2, 'HybridProcessor', 'Initializing local processor for getCachedResult');
      this.localProcessor = new AsiliProcessor();
      await this.localProcessor.initialize();
      Debug.log(2, 'HybridProcessor', 'Local processor initialized');
    }
    
    // ALWAYS check IndexedDB first (both standalone and hybrid modes)
    if (this.localProcessor.unifiedProcessor?.storage) {
      const indexedDBResult = await this.localProcessor.getCachedResult(individualId, traitId);
      if (indexedDBResult) {
        Debug.log(3, 'HybridProcessor', `Found ${traitId} in IndexedDB`);
        return indexedDBResult;
      }
    }
    
    // In hybrid mode, query via REST API instead of DuckDB
    if (this.shouldUseServer()) {
      try {
        Debug.log(3, 'HybridProcessor', `Querying ${traitId} via API`);
        const response = await fetch(`/api/risk-score/${individualId}/${traitId}`);
        
        if (response.ok) {
          const cached = await response.json();
          Debug.log(3, 'HybridProcessor', `Got ${traitId} from API`);
          Debug.log(3, 'HybridProcessor', `API result has pgsDetails: ${!!cached.pgsDetails}, keys: ${cached.pgsDetails ? Object.keys(cached.pgsDetails).length : 0}`);
          
          // Store in IndexedDB for next time
          const storage = this.localProcessor.unifiedProcessor?.storage;
          if (storage) {
            await storage.storeRiskScore(individualId, traitId, cached);
            Debug.log(3, 'HybridProcessor', `Stored ${traitId} in IndexedDB`);
          }
          
          return cached;
        }
      } catch (error) {
        Debug.log(1, 'HybridProcessor', `API query error for ${traitId}: ${error.message}`);
      }
    }
    
    return null;
  }

  async calculateTraitRisk(traitId, individualId, progressCallback) {
    if (this.shouldUseServer()) {
      Debug.log(2, 'HybridProcessor', `Starting server-side risk calculation for ${traitId}`);
      
      return new Promise((resolve, reject) => {
        const key = `${traitId}_${individualId}`;
        
        // Store the promise handlers
        this.pendingCalculations.set(key, {
          resolve,
          reject,
          progressCallback,
          traitId,
          individualId
        });
        
        // Add to server queue via WebSocket
        this.wsManager.addToQueue(traitId, individualId);
        
        // Set timeout
        setTimeout(() => {
          if (this.pendingCalculations.has(key)) {
            this.pendingCalculations.delete(key);
            reject(new Error('Calculation timeout'));
          }
        }, 60000);
      });
    } else {
      return await this.localProcessor?.calculateTraitRisk(traitId, individualId, progressCallback);
    }
  }

  async processAllTraits(individualId, progressCallback, options = {}) {
    if (this.shouldUseServer()) {
      // TODO: Implement server-side batch processing
      throw new Error('Server-side batch processing not implemented yet');
    } else {
      return await this.localProcessor?.processAllTraits(individualId, progressCallback, options);
    }
  }

  async cleanup() {
    if (this.wsManager) {
      this.wsManager.disconnect();
    }
    if (this.localProcessor) {
      await this.localProcessor.cleanup();
    }
    if (this.serverClient) {
      await this.serverClient.cleanup?.();
    }
  }
}