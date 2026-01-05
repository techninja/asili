import { QUEUE_STATUS, QUEUE_PRIORITY } from './types.js';
import { TimeEstimator } from './estimator.js';

export class QueueManager {
  constructor(processor) {
    this.processor = processor;
    this.queue = [];
    this.isProcessing = false;
    this.isPaused = false;
    this.currentItem = null;
    this.listeners = new Set();
    this.timeEstimator = new TimeEstimator();
    this.stats = { processed: 0, failed: 0, totalTime: 0 };
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

  add(traitId, individualId, priority = QUEUE_PRIORITY.NORMAL) {
    const existing = this.queue.find(item => 
      item.traitId === traitId && item.individualId === individualId);
    
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
      this.sortQueue();
      this.emit('updated', existing);
      return existing.id;
    }

    const item = {
      id: `${traitId}_${individualId}_${Date.now()}`,
      traitId,
      individualId,
      priority,
      status: QUEUE_STATUS.PENDING,
      addedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      progress: 0
    };

    this.queue.push(item);
    this.sortQueue();
    this.emit('added', item);
    return item.id;
  }

  remove(itemId) {
    const index = this.queue.findIndex(item => item.id === itemId);
    if (index === -1) return false;

    const item = this.queue[index];
    if (item.status === QUEUE_STATUS.PROCESSING) {
      return false; // Cannot remove currently processing item
    }

    this.queue.splice(index, 1);
    this.emit('removed', item);
    return true;
  }

  moveToNext(itemId) {
    const item = this.queue.find(item => item.id === itemId);
    if (!item || item.status !== QUEUE_STATUS.PENDING) return false;

    item.priority = QUEUE_PRIORITY.URGENT;
    this.sortQueue();
    this.emit('prioritized', item);
    return true;
  }

  sortQueue() {
    this.queue.sort((a, b) => {
      if (a.status === QUEUE_STATUS.PROCESSING) return -1;
      if (b.status === QUEUE_STATUS.PROCESSING) return 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
  }

  async start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.isPaused = false;
    this.emit('started', null);
    await this.processNext();
  }

  pause() {
    this.isPaused = true;
    this.emit('paused', null);
  }

  resume() {
    if (!this.isProcessing) return this.start();
    this.isPaused = false;
    this.emit('resumed', null);
    this.processNext();
  }

  stop() {
    this.isProcessing = false;
    this.isPaused = false;
    if (this.currentItem) {
      this.currentItem.status = QUEUE_STATUS.PENDING;
      this.currentItem.startedAt = null;
      this.currentItem.progress = 0;
    }
    this.currentItem = null;
    this.emit('stopped', null);
  }

  async processNext() {
    if (!this.isProcessing || this.isPaused) return;

    const nextItem = this.queue.find(item => item.status === QUEUE_STATUS.PENDING);
    if (!nextItem) {
      this.isProcessing = false;
      this.emit('completed', null);
      return;
    }

    this.currentItem = nextItem;
    nextItem.status = QUEUE_STATUS.PROCESSING;
    nextItem.startedAt = Date.now();
    this.emit('processing', nextItem);

    try {
      const startTime = Date.now();
      
      const result = await this.processor.calculateTraitRisk(
        nextItem.traitId,
        nextItem.individualId,
        (message, percent) => {
          nextItem.progress = percent;
          this.emit('progress', { item: nextItem, message, percent });
        }
      );

      const duration = Date.now() - startTime;
      this.timeEstimator.recordCompletion(nextItem.traitId, duration, result.matchedVariants);

      nextItem.status = QUEUE_STATUS.COMPLETED;
      nextItem.completedAt = Date.now();
      nextItem.progress = 100;
      this.stats.processed++;
      this.stats.totalTime += duration;

      this.emit('itemCompleted', { item: nextItem, result });

    } catch (error) {
      nextItem.status = QUEUE_STATUS.FAILED;
      nextItem.error = error.message;
      nextItem.completedAt = Date.now();
      this.stats.failed++;
      this.emit('itemFailed', { item: nextItem, error });
    }

    this.currentItem = null;
    setTimeout(() => this.processNext(), 100); // Brief pause between items
  }

  getQueueState() {
    const pending = this.queue.filter(item => item.status === QUEUE_STATUS.PENDING);
    const processing = this.queue.find(item => item.status === QUEUE_STATUS.PROCESSING);
    const completed = this.queue.filter(item => item.status === QUEUE_STATUS.COMPLETED);
    const failed = this.queue.filter(item => item.status === QUEUE_STATUS.FAILED);

    return {
      total: this.queue.length,
      pending: pending.length,
      processing: processing ? 1 : 0,
      completed: completed.length,
      failed: failed.length,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      currentItem: processing,
      estimatedTimeRemaining: this.timeEstimator.estimateQueueTime(pending),
      stats: this.stats
    };
  }

  getQueue() {
    return [...this.queue];
  }

  clear() {
    const pendingItems = this.queue.filter(item => item.status === QUEUE_STATUS.PENDING);
    this.queue = this.queue.filter(item => item.status !== QUEUE_STATUS.PENDING);
    this.emit('cleared', pendingItems);
  }
}