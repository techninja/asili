import { Debug } from '@asili/debug';

export class QueueControl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.queueManager = null;
    this.isExpanded = false;
    this.unsubscribe = null;
    this.chartData = [];
    this.maxDataPoints = 60;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  setQueueManager(queueManager) {
    this.unsubscribe?.();
    this.queueManager = queueManager;

    if (queueManager) {
      this.unsubscribe = queueManager.subscribe(event => {
        this.updateDisplay(event);

        // Notify risk dashboard to refresh cards when queue items complete
        if (event.event === 'itemCompleted' || event.event === 'itemFailed') {
          this.notifyRiskDashboard();
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

  updateDisplay(event) {
    const state = event.queue;
    const widget = this.shadowRoot.querySelector('.queue-widget');
    const summary = this.shadowRoot.querySelector('.queue-summary');
    const details = this.shadowRoot.querySelector('.queue-details');

    if (!widget || !summary) return;

    // Update summary
    const timeDisplay =
      state.isProcessing && state.estimatedTimeRemaining > 0
        ? this.formatTime(state.estimatedTimeRemaining)
        : '--';

    summary.innerHTML = `
      <div class="queue-status ${state.isProcessing ? 'active' : 'idle'}">
        ${state.isProcessing ? (state.isPaused ? '⏸️' : '⚡') : '▶️'}
      </div>
      <div class="queue-info">
        <div class="queue-count">${state.pending + state.processing}</div>
        <div class="queue-label">in queue</div>
      </div>
      <div class="queue-time">
        ${timeDisplay}
      </div>
    `;

    // Update chart data
    if (state.currentItem?.progress) {
      this.chartData.push({
        timestamp: Date.now(),
        cpu: Math.random() * 30 + 40, // Mock CPU usage
        memory: Math.random() * 20 + 60 // Mock memory usage
      });

      if (this.chartData.length > this.maxDataPoints) {
        this.chartData.shift();
      }
    }

    // Update details if expanded
    if (this.isExpanded && details) {
      this.updateDetails(state);
    }

    // Update chart
    this.updateChart();
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
          <div class="item-name">${this.getTraitName(currentItem.traitId)}</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${currentItem.progress}%"></div>
          </div>
          <div class="progress-text">${Math.round(currentItem.progress)}%</div>
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
              <span class="item-name">${this.getTraitName(item.traitId)}</span>
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
      
      <div class="stats-chart">
        <canvas id="statsChart" width="200" height="60"></canvas>
      </div>
      
      <div class="queue-stats">
        <div class="stat">
          <span class="stat-label">Processed:</span>
          <span class="stat-value">${state.stats.processed}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Failed:</span>
          <span class="stat-value">${state.stats.failed}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Avg Time:</span>
          <span class="stat-value">${this.formatTime(state.stats.totalTime / Math.max(state.stats.processed, 1))}</span>
        </div>
      </div>
    `;
  }

  updateChart() {
    if (!this.isExpanded || this.chartData.length < 2) return;

    const canvas = this.shadowRoot.getElementById('statsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw CPU line (red)
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.chartData.forEach((point, i) => {
      const x = (i / (this.chartData.length - 1)) * width;
      const y = height - (point.cpu / 100) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Memory line (blue)
    ctx.strokeStyle = '#4444ff';
    ctx.beginPath();
    this.chartData.forEach((point, i) => {
      const x = (i / (this.chartData.length - 1)) * width;
      const y = height - (point.memory / 100) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  getTraitName(traitId) {
    // This would need to be connected to the trait data
    return traitId.replace(/^MONDO_|^EFO_/, '').replace(/_/g, ' ');
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
          font-size: 14px;
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
        
        .stats-chart {
          margin: 16px 0;
          text-align: center;
        }
        
        .stats-chart canvas {
          border: 1px solid #eee;
          border-radius: 4px;
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
