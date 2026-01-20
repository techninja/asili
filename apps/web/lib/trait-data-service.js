import { useTraitStore } from './trait-store.js';
import { Debug } from '@asili/debug';

export class TraitDataService {
  constructor(processor, queueManager) {
    this.processor = processor;
    this.queueManager = queueManager;
    this.subscriptions = new Set();
  }

  // Subscribe to queue events and update trait store
  subscribeToQueueEvents() {
    if (this.queueManager) {
      const unsubscribe = this.queueManager.subscribe(event => {
        Debug.log(3, 'TraitDataService', `Queue event: ${event.event}`, event.data);
        
        if (event.event === 'added' && event.data) {
          // Item added to queue
          this.updateTraitQueueStatus(event.data.traitId, event.data);
        } else if (event.event === 'progress' && event.data?.item) {
          // Update progress for processing item
          this.updateTraitQueueStatus(event.data.item.traitId, event.data.item);
        } else if (event.event === 'processing' && event.data) {
          // Item started processing
          this.updateTraitQueueStatus(event.data.traitId, event.data);
        } else if (event.data?.traitId) {
          // Other queue events
          this.updateTraitQueueStatus(event.data.traitId, event.data);
        }
        
        // When job completes, reload cache for that trait
        if (event.event === 'itemCompleted' && event.data?.item) {
          this.updateTraitCache(event.data.item.traitId, event.data.item.individualId);
        }
      });
      this.subscriptions.add(unsubscribe);
    }
  }

  // Update trait cache data
  async updateTraitCache(traitId, individualId) {
    const cached = await this.processor?.getCachedResult(individualId, traitId);
    if (cached) {
      Debug.log(3, 'TraitDataService', `Cache found for ${traitId}`);
      // Clear queue status when cache is loaded
      useTraitStore.getState().setTraitQueue(traitId, null);
    }
    useTraitStore.getState().setTraitCache(traitId, cached);
  }

  // Update trait queue status
  updateTraitQueueStatus(traitId, queueData) {
    Debug.log(3, 'TraitDataService', `Updating queue status for ${traitId}:`, queueData);
    useTraitStore.getState().setTraitQueue(traitId, queueData);
  }

  // Add trait to queue
  addToQueue(traitId, individualId, trait = null) {
    if (this.queueManager) {
      this.queueManager.add(traitId, individualId, 3, trait);
    }
  }

  // Clear all trait data (when individual changes)
  clearAllTraitData() {
    useTraitStore.getState().clearAllTraits();
  }

  // Load initial trait data for an individual
  async loadTraitData(traitId, individualId) {
    // Load cached data
    await this.updateTraitCache(traitId, individualId);
    
    // Check queue status
    if (this.queueManager) {
      const queue = this.queueManager.getQueue();
      const queueItem = queue.find(
        item => item.traitId === traitId && item.individualId === individualId
      );
      if (queueItem) {
        this.updateTraitQueueStatus(traitId, queueItem);
      }
    }
  }

  // Cleanup subscriptions
  destroy() {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }
}