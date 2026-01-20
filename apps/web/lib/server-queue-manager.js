/**
 * Server Queue Manager - mirrors server queue state in frontend
 */

import { QUEUE_STATUS } from '../../packages/core/src/queue/types.js';

export class ServerQueueManager {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.queue = [];
    this.listeners = new Set();
    this.setupWebSocketListeners();
  }

  setupWebSocketListeners() {
    this.wsManager.on('queue-state', (data) => {
      this.queue = data.queue || [];
      this.listeners.forEach(callback => {
        try {
          callback({ event: 'updated', data: null, queue: this.getQueueState() });
        } catch (error) {
          console.error('Queue listener error:', error);
        }
      });
    });

    this.wsManager.on('queue-updated', (data) => {
      const existing = this.queue.find(item => 
        item.traitId === data.traitId && item.individualId === data.individualId
      );
      
      if (!existing) {
        const newItem = {
          id: data.jobId,
          traitId: data.traitId,
          individualId: data.individualId,
          status: QUEUE_STATUS.PENDING,
          progress: 0
        };
        this.queue.push(newItem);
        this.emit('added', newItem);
      }
    });

    this.wsManager.on('job-started', (data) => {
      const item = this.queue.find(item => item.id === data.jobId);
      if (item) {
        item.status = QUEUE_STATUS.PROCESSING;
        this.emit('processing', { traitId: data.traitId, individualId: data.individualId, id: data.jobId, status: 'processing', progress: 0 });
      }
    });

    this.wsManager.on('progress', (data) => {
      const item = this.queue.find(item => 
        item.traitId === data.traitId && item.individualId === data.individualId
      );
      if (item) {
        item.progress = data.percent;
        this.emit('progress', { traitId: data.traitId, individualId: data.individualId, message: data.message, percent: data.percent });
      }
    });

    this.wsManager.on('result', (data) => {
      const item = this.queue.find(item => 
        item.traitId === data.traitId && item.individualId === data.individualId
      );
      if (item) {
        item.status = data.success ? QUEUE_STATUS.COMPLETED : QUEUE_STATUS.FAILED;
        item.progress = 100;
        this.emit(data.success ? 'itemCompleted' : 'itemFailed', { item, result: data });
        
        // Remove completed items after a delay
        setTimeout(() => {
          const index = this.queue.indexOf(item);
          if (index > -1) {
            this.queue.splice(index, 1);
            this.emit('updated', null);
          }
        }, 2000);
      }
    });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ event, data, queue: this.getQueueState() });
      } catch (error) {
        console.error('Queue listener error:', error);
      }
    });
  }

  add(traitId, individualId, priority = 3) {
    this.wsManager.addToQueue(traitId, individualId);
    return `${traitId}_${individualId}_${Date.now()}`;
  }

  getQueue() {
    return [...this.queue];
  }

  getQueueState() {
    const pending = this.queue.filter(item => item.status === QUEUE_STATUS.PENDING || !item.status);
    const processing = this.queue.find(item => item.status === QUEUE_STATUS.PROCESSING);
    const completed = this.queue.filter(item => item.status === QUEUE_STATUS.COMPLETED);
    const failed = this.queue.filter(item => item.status === QUEUE_STATUS.FAILED);

    return {
      total: this.queue.length,
      pending: pending.length,
      processing: processing ? 1 : 0,
      completed: completed.length,
      failed: failed.length,
      isProcessing: !!processing,
      isPaused: false,
      currentItem: processing,
      stats: {}
    };
  }

  moveToNext(itemId) {
    // Server handles prioritization
    return true;
  }

  remove(itemId) {
    // Server handles removal
    return true;
  }
}