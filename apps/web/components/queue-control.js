import { Debug } from '@asili/debug';
import { useAppStore } from '../lib/store.js';

export class QueueControl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.queueManager = null;
    this.riskDashboard = null;
    this.isExpanded = false;
    this.unsubscribe = null;
    this.variantsPerSecond = 0;
    this.totalTraits = 0;
    this.cachedTraitsCount = 0;
  }

  setRiskDashboard(riskDashboard) {
    this.riskDashboard = riskDashboard;
  }

  setProcessor(processor) {
    this.processor = processor;
    this.loadProgressFromServer();
  }

  connectedCallback() {
    this.render();
    
    // Subscribe to store changes for individual selection
    this.storeUnsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.selectedIndividual !== prevState.selectedIndividual) {
        this.loadProgressFromServer();
      }
    });
    
    // Initial load
    this.loadProgressFromServer();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    this.storeUnsubscribe?.();
  }

  setQueueManager(queueManager) {
    this.unsubscribe?.();
    this.queueManager = queueManager;

    if (queueManager) {
      this.unsubscribe = queueManager.subscribe(async event => {
        this.updateDisplay(event);

        // Track speed from progress events
        if (event.event === 'progress') {
          // Extract speed from statusMessage if available
          if (event.data?.message) {
            const speedMatch = event.data.message.match(/\((\d+(?:,\d+)*)\/(sec|s)\)/);
            if (speedMatch) {
              this.variantsPerSecond = parseInt(speedMatch[1].replace(/,/g, ''));
              if (this.isExpanded) {
                this.updateDetails(this.queueManager.getQueueState());
              }
            }
          }
          // Also try structured data
          if (event.data?.throughput) {
            this.variantsPerSecond = event.data.throughput;
            if (this.isExpanded) {
              this.updateDetails(this.queueManager.getQueueState());
            }
          }
        }

        // Update individual cards based on queue events
        if (event.event === 'processing') {
          this.updateCardForProcessing(event.data.traitId, event.data.individualId);
        } else if (event.event === 'progress') {
          this.updateCardProgress(event.data.traitId, event.data.individualId, event.data.percent, event.data.message);
        } else if (event.event === 'itemCompleted') {
          await this.updateCardCompleted(event.data.item.traitId, event.data.item.individualId);
          this.loadProgressFromServer();
          this.variantsPerSecond = 0;
        }

        // Notify risk dashboard to refresh cards when queue items complete
        if (event.event === 'itemCompleted' || event.event === 'itemFailed') {
          if (event.event === 'itemCompleted') {
            const currentCount = useAppStore.getState().completedTraitsCount;
            useAppStore.getState().setCompletedTraitsCount(currentCount + 1);
          }
        }
      });
      this.updateDisplay({ queue: queueManager.getQueueState() });
    }
  }

  notifyRiskDashboard() {
    // Find risk dashboard and trigger refresh
    const riskDashboard = document.querySelector('risk-dashboard');
    if (riskDashboard) {
      riskDashboard.filterTraits();
    }
  }

  updateCardForProcessing(traitId, individualId) {
    const riskDashboard = document.querySelector('risk-dashboard');
    if (riskDashboard) {
      const card = riskDashboard.shadowRoot.querySelector(`[data-trait-id="${traitId}"]`);
      if (card) {
        const riskDisplay = card.querySelector('.risk-display');
        if (riskDisplay) {
          riskDisplay.innerHTML = `
            <button class="analyze-btn progress" disabled style="--progress: 0%">
              <span>⚡ Processing... 0%</span>
            </button>
          `;
        }
      }
    }
  }

  updateCardProgress(traitId, individualId, progress, message) {
    const riskDashboard = document.querySelector('risk-dashboard');
    if (riskDashboard) {
      const card = riskDashboard.shadowRoot.querySelector(`[data-trait-id="${traitId}"]`);
      if (card) {
        const button = card.querySelector('.analyze-btn.progress');
        if (button) {
          const span = button.querySelector('span');
          if (span) {
            span.textContent = `⚡ ${message} ${Math.round(progress)}%`;
          }
          button.style.setProperty('--progress', `${progress}%`);
        }
      }
    }
  }

  async updateCardCompleted(traitId, individualId) {
    const riskDashboard = document.querySelector('risk-dashboard');
    if (riskDashboard && riskDashboard.refreshTraitCard) {
      // Clear cache first so fresh data is loaded
      const hybridProcessor = riskDashboard.processor;
      if (hybridProcessor) {
        hybridProcessor.cacheData = null;
        hybridProcessor.cachePromise = null;
      }
      await riskDashboard.refreshTraitCard(traitId, individualId);
    }
  }

  updateDisplay(event) {
    const state = event.queue;
    const widget = this.shadowRoot.querySelector('.queue-widget');
    const summary = this.shadowRoot.querySelector('.queue-summary');
    const details = this.shadowRoot.querySelector('.queue-details');

    if (!widget || !summary) return;

    // Update summary with dynamic time estimates
    const totalAvailableTraits = this.getTotalAvailableTraits();
    const completedTraits = this.cachedTraitsCount;
    const overallProgress = totalAvailableTraits > 0 ? (completedTraits / totalAvailableTraits) * 100 : 0;
    const currentItem = this.queueManager?.getQueue().find(item => item.status === 'processing');
    
    // Get updated queue time estimate
    const queueTimeMs = this.queueManager?.timeEstimator?.estimateQueueTime(this.queueManager.getQueue()) || 0;
    const timeDisplay = state.isProcessing && queueTimeMs > 0 ? this.formatTime(queueTimeMs) : '--';

    summary.innerHTML = `
      <div class="queue-status ${state.isProcessing ? 'active' : 'idle'}">
        ${state.isProcessing ? (state.isPaused ? '⏸️' : '⚡') : '▶️'}
      </div>
      <div class="queue-info">
        <div class="queue-count">${state.total}</div>
        <div class="queue-label">in queue</div>
        <div class="summary-progress-bar">
          <div class="summary-progress-fill" style="width: ${overallProgress}%"></div>
        </div>
        <div class="overall-progress">${Math.round(overallProgress)}% complete (${completedTraits}/${totalAvailableTraits})</div>
        ${currentItem ? `
          <div class="current-progress-bar">
            <div class="current-progress-fill" style="width: ${currentItem.progress}%"></div>
          </div>
          <div class="current-progress">${Math.round(currentItem.progress)}% current</div>
        ` : ''}
      </div>
      <div class="queue-time">
        ${timeDisplay}
      </div>
    `;

    // Update details if expanded
    if (this.isExpanded && details) {
      this.updateDetails(state);
    }
  }

  updateDetails(state) {
    const details = this.shadowRoot.querySelector('.queue-details');
    if (!details) return;

    const queue = this.queueManager.getQueue();
    const pendingItems = queue.filter(item => item.status === 'pending');
    const currentItem = queue.find(item => item.status === 'processing');

    details.innerHTML = `
      <div class="queue-controls">
        <button class="control-btn ${state.isProcessing ? 'pause' : 'start'}" 
                onclick="this.getRootNode().host.toggleQueue()">
          ${state.isProcessing ? (state.isPaused ? '▶️ Resume' : '⏸️ Pause') : '▶️ Start'}
        </button>
        <button class="control-btn stop" onclick="this.getRootNode().host.stopQueue()">⏹️ Stop</button>
        <button class="control-btn clear" onclick="this.getRootNode().host.clearQueue()">🗑️ Clear</button>
      </div>
      
      ${
        currentItem
          ? `
        <div class="current-item">
          <div class="item-header">Currently Processing:</div>
          <div class="item-name">${this.getCurrentItemName(currentItem)}</div>
          ${currentItem.statusMessage ? `<div class="status-message">${currentItem.statusMessage}</div>` : ''}
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${currentItem.progress}%"></div>
          </div>
          <div class="progress-info">
            <span class="progress-text">${Math.round(currentItem.progress)}%</span>
            <span class="time-remaining">${this.getItemTimeRemaining(currentItem)}</span>
          </div>
        </div>
      `
          : ''
      }
      
      <div class="queue-list">
        <div class="list-header">Queue (${pendingItems.length} items):</div>
        ${pendingItems
          .slice(0, 5)
          .map(
            (item, index) => `
          <div class="queue-item">
            <div class="item-info">
              <span class="item-position">#${index + 1}</span>
              <span class="item-name">${this.getTraitName(item)}</span>
            </div>
            <div class="item-actions">
              <button class="action-btn next" onclick="this.getRootNode().host.moveToNext('${item.id}')"
                      ${index === 0 ? 'disabled' : ''}>⬆️</button>
            </div>
          </div>
        `
          )
          .join('')}
        ${pendingItems.length > 5 ? `<div class="more-items">...and ${pendingItems.length - 5} more</div>` : ''}
      </div>
      
      <div class="queue-stats">
        <div class="stat">
          <span class="stat-label">Processed:</span>
          <span class="stat-value">${this.cachedTraitsCount}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Speed:</span>
          <span class="stat-value">${this.variantsPerSecond > 0 ? this.formatVariantCount(this.variantsPerSecond) + '/s' : '--'}</span>
        </div>
      </div>
    `;
  }

getTraitName(item) {
    const { traitId, trait } = item;
    
    // Try to get trait from risk dashboard if not in item
    const traitData = trait || this.riskDashboard?.availableTraits?.find(t => t.id === traitId);
    
    if (traitData) {
      const variantCount = this.formatVariantCount(traitData.variant_count);
      const pgsCount = Object.keys(traitData.pgs_metadata || {}).length;
      const timeEstimate = this.estimateProcessingTime(traitData.variant_count);
      return `
        <div class="trait-title">${traitData.name}</div>
        <div class="trait-meta">
          <span class="pgs-count">${pgsCount} PGS</span>
          <span class="variant-count">${variantCount} variants</span>
          <span class="time-estimate">⏳ ${timeEstimate}</span>
        </div>
      `;
    }
    
    return traitId.replace(/^MONDO_|^EFO_/, '').replace(/_/g, ' ');
  }

  getCurrentItemName(item) {
    const { traitId, trait } = item;
    
    // Try to get trait from risk dashboard if not in item
    const traitData = trait || this.riskDashboard?.availableTraits?.find(t => t.id === traitId);
    
    if (traitData) {
      const variantCount = this.formatVariantCount(traitData.variant_count);
      return `${traitData.name} - ${variantCount}`;
    }
    
    return traitId.replace(/^MONDO_|^EFO_/, '').replace(/_/g, ' ');
  }

  getItemTimeRemaining(item) {
    const traitData = item.trait || this.riskDashboard?.availableTraits?.find(t => t.id === item.traitId);
    if (!traitData?.variant_count || !item.progress) return '--';
    
    const performance = this.queueManager?.timeEstimator?.getCurrentPerformance();
    const variantsPerSecond = performance?.variantsPerSecond || 100000;
    
    const totalVariants = traitData.variant_count;
    const remainingVariants = totalVariants * (1 - item.progress / 100);
    const remainingSeconds = remainingVariants / variantsPerSecond;
    
    return this.formatTime(remainingSeconds * 1000);
  }

  async loadProgressFromServer() {
    const selectedIndividual = useAppStore.getState().selectedIndividual;
    
    if (!selectedIndividual) {
      this.cachedTraitsCount = 0;
      this.totalTraits = 0;
      return;
    }
    
    try {
      const response = await fetch('/status');
      const data = await response.json();
      
      console.log('[QueueControl] Server progress data:', data.progress);
      
      this.totalTraits = data.progress?.totalTraits || 0;
      this.cachedTraitsCount = data.progress?.cachedByIndividual?.[selectedIndividual] || 0;
      
      console.log('[QueueControl] Set totalTraits:', this.totalTraits, 'cachedTraitsCount:', this.cachedTraitsCount);
      
      if (this.queueManager) {
        this.updateDisplay({ queue: this.queueManager.getQueueState() });
      }
    } catch (error) {
      console.error('[QueueControl] Failed to load progress from server:', error);
    }
  }

  getTotalAvailableTraits() {
    return this.totalTraits || this.riskDashboard?.availableTraits?.length || 0;
  }

  formatVariantCount(count) {
    if (!count) return 'unknown';
    if (count >= 1000000) return `${(count / 1000000).toFixed(0)}mm`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}k`;
    return count.toLocaleString();
  }

  estimateProcessingTime(variantCount) {
    if (!variantCount) return '~1m';
    
    // Get current performance from queue manager's time estimator
    const performance = this.queueManager?.timeEstimator?.getCurrentPerformance();
    const variantsPerSecond = performance?.variantsPerSecond || 100000;
    
    const seconds = Math.max(30, variantCount / variantsPerSecond);
    return this.formatTime(seconds * 1000);
  }

  formatTime(ms) {
    if (!ms || ms < 1000) return '< 1s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
    const widget = this.shadowRoot.querySelector('.queue-widget');
    widget.classList.toggle('expanded', this.isExpanded);

    if (this.isExpanded && this.queueManager) {
      this.updateDetails(this.queueManager.getQueueState());
    }
  }

  toggleQueue() {
    if (!this.queueManager) return;

    const state = this.queueManager.getQueueState();
    if (state.isProcessing) {
      if (state.isPaused) {
        this.queueManager.resume();
      } else {
        this.queueManager.pause();
      }
    } else {
      this.queueManager.start();
    }
  }

  stopQueue() {
    this.queueManager?.stop();
  }

  clearQueue() {
    if (confirm('Clear all pending items from queue?')) {
      this.queueManager?.clear();
    }
  }

  moveToNext(itemId) {
    this.queueManager?.moveToNext(itemId);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .queue-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: white;
          border: 2px solid #007acc;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
          cursor: pointer;
          min-width: 200px;
        }
        
        .queue-widget.expanded {
          cursor: default;
          max-width: 350px;
          max-height: 500px;
          overflow-y: auto;
        }
        
        .queue-summary {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          gap: 12px;
        }
        
        .queue-status {
          font-size: 20px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f0f0f0;
        }
        
        .queue-status.active {
          background: #e8f5e8;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        .queue-info {
          flex: 1;
        }
        
        .queue-count {
          font-size: 18px;
          font-weight: bold;
          color: #007acc;
        }
        
        .summary-progress-bar {
          height: 3px;
          background: #eee;
          border-radius: 2px;
          overflow: hidden;
          margin: 4px 0 2px 0;
        }
        
        .summary-progress-fill {
          height: 100%;
          background: #007acc;
          transition: width 0.3s ease;
        }
        
        .current-progress-bar {
          height: 2px;
          background: #eee;
          border-radius: 1px;
          overflow: hidden;
          margin: 2px 0;
        }
        
        .current-progress-fill {
          height: 100%;
          background: #28a745;
          transition: width 0.3s ease;
        }
        
        .current-progress {
          font-size: 10px;
          color: #28a745;
          font-weight: 500;
        }
        
        .overall-progress {
          font-size: 11px;
          color: #007acc;
          font-weight: 500;
        }
        
        .status-message {
          font-size: 11px;
          color: #666;
          margin: 4px 0;
          font-style: italic;
        }
        
        .queue-label {
          font-size: 12px;
          color: #666;
        }
        
        .queue-time {
          font-size: 12px;
          color: #666;
          text-align: right;
        }
        
        .queue-details {
          border-top: 1px solid #eee;
          padding: 16px;
          display: none;
        }
        
        .queue-widget.expanded .queue-details {
          display: block;
        }
        
        .queue-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .control-btn {
          flex: 1;
          padding: 6px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 12px;
        }
        
        .control-btn:hover {
          background: #f5f5f5;
        }
        
        .control-btn.start, .control-btn.pause {
          background: #007acc;
          color: white;
          border-color: #007acc;
        }
        
        .control-btn.stop {
          background: #dc3545;
          color: white;
          border-color: #dc3545;
        }
        
        .current-item {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
        }
        
        .item-header {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        
        .item-name {
          font-weight: bold;
          margin-bottom: 8px;
          font-size: 12px;
          line-height: 1.3;
        }
        
        .trait-title {
          font-weight: bold;
          font-size: 11px;
          line-height: 1.2;
          margin-bottom: 2px;
        }
        
        .trait-meta {
          display: flex;
          gap: 8px;
          font-size: 10px;
          color: #666;
        }
        
        .pgs-count {
          color: #28a745;
          font-weight: 500;
        }
        
        .variant-count {
          color: #6c757d;
        }
        
        .time-estimate {
          color: #007acc;
          font-weight: 500;
        }
        
        .progress-bar {
          height: 6px;
          background: #eee;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 4px;
        }
        
        .progress-fill {
          height: 100%;
          background: #007acc;
          transition: width 0.3s ease;
        }
        
        .progress-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .time-remaining {
          font-size: 11px;
          color: #007acc;
          font-weight: 500;
        }
        
        .progress-text {
          font-size: 11px;
          color: #666;
          text-align: right;
        }
        
        .list-header {
          font-weight: bold;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .queue-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        
        .item-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .item-position {
          font-size: 12px;
          color: #666;
          min-width: 24px;
        }
        
        .action-btn {
          background: none;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .action-btn:hover:not(:disabled) {
          background: #f5f5f5;
        }
        
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .more-items {
          font-size: 12px;
          color: #666;
          text-align: center;
          padding: 8px 0;
        }
        
        .queue-stats {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }
        
        .stat {
          text-align: center;
        }
        
        .stat-label {
          display: block;
          color: #666;
        }
        
        .stat-value {
          font-weight: bold;
          color: #007acc;
        }
      </style>
      
      <div class="queue-widget" onclick="this.getRootNode().host.toggleExpanded()">
        <div class="queue-summary">
          <div class="queue-status idle">⏹️</div>
          <div class="queue-info">
            <div class="queue-count">0</div>
            <div class="queue-label">in queue</div>
          </div>
          <div class="queue-time">--</div>
        </div>
        <div class="queue-details">
          <!-- Details populated dynamically -->
        </div>
      </div>
    `;
  }
}

customElements.define('queue-control', QueueControl);
