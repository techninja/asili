import { useTraitStore } from '../lib/trait-store.js';

export class TraitCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.trait = null;
    this.individualId = null;
    this.unsubscribe = null;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.subscribeToTraitStore();
    this.updateDisplay();
    // Don't load immediately - wait for intersection observer
    this.setupIntersectionObserver();
  }

  setupIntersectionObserver() {
    // Only load cached result when card becomes visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.hasLoadedCache) {
          this.hasLoadedCache = true;
          this.loadCachedResult();
          observer.unobserve(this);
        }
      });
    }, { rootMargin: '50px' });

    observer.observe(this);
  }

  disconnectedCallback() {
    this.unsubscribe?.();
  }

  setData(trait, individualId) {
    this.trait = trait;
    this.individualId = individualId;
    this.dataset.traitId = trait.id;

    if (this.shadowRoot?.querySelector('.content')) {
      this.updateDisplay();
    }
  }

  async loadCachedResult() {
    if (!this.trait || !this.individualId) return;

    // Check if already in store
    const state = useTraitStore.getState().getTraitState(this.trait.id);
    if (state.cached || state.loading) return;

    // Check queue status first
    const processor = window.__asiliProcessor;
    if (!processor) return;

    const queueManager = processor.getQueueManager();
    if (queueManager) {
      const queue = queueManager.getQueue();
      const queueItem = queue.find(item =>
        item.traitId === this.trait.id && item.individualId === this.individualId
      );
      if (queueItem) {
        useTraitStore.getState().setTraitQueue(this.trait.id, queueItem);
        return;
      }
    }

    // If not in queue, check cache
    if (state.queueItem) return;

    useTraitStore.getState().setTraitLoading(this.trait.id, true);

    try {
      const cached = await processor.getCachedResult(this.individualId, this.trait.id);
      if (cached) {
        useTraitStore.getState().setTraitCache(this.trait.id, cached);
      }
    } catch (error) {
      // Silently fail - card will show "Add to Queue" button
    } finally {
      useTraitStore.getState().setTraitLoading(this.trait.id, false);
    }
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      const pgsItem = e.target.closest('.pgs-item');
      if (pgsItem?.dataset.pgsId) {
        this.selectPgs(pgsItem.dataset.pgsId);
      }

      if (e.target.closest('.add-queue-btn')) {
        this.addToQueue();
      }
    });
  }

  subscribeToTraitStore() {
    let previousState = null;
    this.unsubscribe = useTraitStore.subscribe(() => {
      if (!this.trait) return;
      const currentState = useTraitStore.getState().getTraitState(this.trait.id);
      // Only update if THIS trait's state changed
      if (JSON.stringify(currentState) !== JSON.stringify(previousState)) {
        previousState = currentState;
        this.updateDisplay();
      }
    });
  }

  updateDisplay() {
    if (!this.trait) return;

    const content = this.shadowRoot?.querySelector('.content');
    if (!content) return;

    const state = useTraitStore.getState().getTraitState(this.trait.id);

    content.innerHTML = `
      <div class="trait-header">
        <h3>${this.trait.name}</h3>
        <span class="category">${this.trait.categories?.[0] || 'Other'}</span>
      </div>
      ${this.trait.description ?
        `<div class="description">${this.trait.description}</div>` : ''}
      <div class="stats">${Object.keys(this.trait.pgs_metadata || {}).length} PGS | ${this.trait.variant_count?.toLocaleString() || '?'} variants</div>
      ${this.renderContent(state)}
    `;
  }

  renderContent(state) {
    if (state.selectedPgsId && state.cached) {
      return `<pgs-breakdown trait-id="${this.trait.id}" pgs-id="${state.selectedPgsId}"></pgs-breakdown>`;
    }

    if (state.cached) {
      return this.renderResults(state.cached);
    }

    if (state.queueItem) {
      return this.renderQueue(state.queueItem);
    }

    if (state.loading) {
      return '<div class="loading-state">⏳ Checking cache...</div>';
    }

    return '<button class="add-queue-btn">Add to Queue</button>';
  }

  renderResults(cached) {
    const score = cached.riskScore;
    const percentile = this.scoreToPercentile(score);
    const level = percentile >= 70 ? 'high' : percentile <= 30 ? 'low' : 'medium';

    return `
      <div class="results">
        <div class="score">${this.formatScore(score)}</div>
        <div class="percentile">${this.formatPercentile(percentile)}</div>
        <div class="level ${level}">${level} risk</div>
        <div class="stats">
          ${this.formatNumber(cached.matchedVariants)} of ${this.formatNumber(cached.totalVariants)} variants matched (${((cached.matchedVariants / cached.totalVariants) * 100).toFixed(1)}%)<br>
          <div style="text-align: left; margin-top: 5px;">Calculated ${new Date(cached.calculatedAt).toLocaleDateString()}</div>
        </div>
        ${this.renderPgsList(cached.pgsBreakdown, cached.pgsDetails)}
      </div>
    `;
  }

  renderQueue(queueItem) {
    const isProcessing = queueItem.status === 'processing';
    const progress = queueItem.progress || queueItem.percent || 0;
    const statusMessage = queueItem.statusMessage || queueItem.message || (isProcessing ? 'Processing' : 'Queued');
    return `
      <div class="queue-status">
        <div class="queue-label">${isProcessing ? '⚡' : '⏳'} ${statusMessage}</div>
        ${isProcessing && progress > 0 ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">${Math.round(progress)}%</div>
        ` : ''}
      </div>
    `;
  }

  renderPgsList(pgsBreakdown, pgsDetails) {
    if (!pgsBreakdown) return '';

    const entries = Object.entries(pgsBreakdown)
      .filter(([_, data]) => Math.abs(data.positiveSum + data.negativeSum) >= 0.005)
      .sort(([_, a], [__, b]) => Math.abs(b.positiveSum + b.negativeSum) - Math.abs(a.positiveSum + a.negativeSum));

    return `
      <div class="pgs-list">
        ${entries.map(([pgsId, data]) => {
      const score = data.positiveSum + data.negativeSum;
      // Fallback to trait metadata if pgsDetails is missing
      const name = pgsDetails?.[pgsId]?.metadata?.name || this.trait?.pgs_metadata?.[pgsId]?.name || pgsId;
      const absPositive = Math.abs(data.positiveSum);
      const absNegative = Math.abs(data.negativeSum);
      const total = absPositive + absNegative;
      const negPct = total > 0 ? (absNegative / total) * 100 : 0;
      const posPct = total > 0 ? (absPositive / total) * 100 : 0;
      const scoreColor = score >= 0 ? '#721c24' : '#155724';

      return `<div class="pgs-item" data-pgs-id="${pgsId}">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px;">
              <span>${name}</span>
              <span class="score" style="color: ${scoreColor}">${this.formatScore(score)}</span>
            </div>
            <div style="width: 100%; height: 16px; border: 1px solid #ddd; border-radius: 3px; overflow: hidden; margin-top: 2px; background: #f8f9fa;">
              <div style="background: #d4edda !important; height: 100%; width: ${negPct}%; float: left;" title="${data.negative} variants: ${this.formatScore(data.negativeSum)}"></div>
              <div style="background: #f8d7da !important; height: 100%; width: ${posPct}%; float: left;" title="${data.positive} variants: ${this.formatScore(data.positiveSum)}"></div>
            </div>
          </div>`;
    }).join('')}
      </div>
    `;
  }

  selectPgs(pgsId) {
    const state = useTraitStore.getState().getTraitState(this.trait.id);
    if (!state.cached?.pgsBreakdown) return;

    // Use same sorting as renderPgsList
    const sortedPgsIds = Object.entries(state.cached.pgsBreakdown)
      .filter(([_, data]) => Math.abs(data.positiveSum + data.negativeSum) >= 0.005)
      .sort(([_, a], [__, b]) => Math.abs(b.positiveSum + b.negativeSum) - Math.abs(a.positiveSum + a.negativeSum))
      .map(([pgsId]) => pgsId);

    const navigation = {
      pgsIds: sortedPgsIds,
      currentIndex: sortedPgsIds.indexOf(pgsId)
    };

    useTraitStore.getState().setSelectedPgs(this.trait.id, pgsId, navigation);
  }

  addToQueue() {
    const state = useTraitStore.getState().getTraitState(this.trait.id);
    if (state.loading) return; // Don't add to queue while checking cache

    this.dispatchEvent(new CustomEvent('add-to-queue', {
      detail: { traitId: this.trait.id, individualId: this.individualId },
      bubbles: true,
      composed: true  // Allow event to cross shadow DOM boundary
    }));
  }



  scoreToPercentile(score) {
    const z = Math.abs(score);
    let percentile = z < 1 ? 50 + z * 34.13 : z < 2 ? 84.13 + (z - 1) * 13.59 : z < 3 ? 97.72 + (z - 2) * 2.14 : 99.87;
    return Math.round(Math.max(1, Math.min(99, score < 0 ? 100 - percentile : percentile)));
  }

  formatScore(score) {
    const abs = Math.abs(score);
    const sign = score >= 0 ? '+' : '';
    return abs >= 10 ? `${sign}${score.toFixed(2)}σ` : `${sign}${score.toFixed(3)}σ`;
  }

  formatPercentile(percentile) {
    const suffix = percentile % 10 === 1 && percentile !== 11 ? 'st' : percentile % 10 === 2 && percentile !== 12 ? 'nd' : percentile % 10 === 3 && percentile !== 13 ? 'rd' : 'th';
    return `${percentile}${suffix} percentile`;
  }

  formatNumber(num) {
    if (!num) return 'unknown';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toLocaleString();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .trait-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .trait-header h3 { margin: 0; font-size: 18px; }
        .category { font-size: 12px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
        .stats { font-size: 11px; color: #666; margin: 10px 0; text-align: center; font-style: italic; }
        .results { text-align: center; }
        .score { font-size: 2em; font-weight: bold; color: #007acc; }
        .percentile { color: #666; margin: 5px 0; }
        .level { padding: 4px 8px; border-radius: 4px; font-size: 12px; margin: 5px 0; }
        .low { background: #d4edda; color: #155724; }
        .medium { background: #fff3cd; color: #856404; }
        .high { background: #f8d7da; color: #721c24; }
        .pgs-list { margin-top: 15px; max-height: 200px; overflow-y: auto; overflow-x: hidden; padding-right: 8px; }
        .pgs-item { margin-bottom: 8px; cursor: pointer; }
        .pgs-item:hover { background: #f8f9fa; }
        .pgs-item span:first-child { font-size: 11px; color: #007acc; font-weight: 500; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pgs-item .score { font-size: 11px; font-weight: bold; }
        .queue-status { text-align: center; padding: 10px; background: #fff3cd; border-radius: 4px; }
        .queue-label { font-weight: 500; margin-bottom: 8px; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 8px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #007acc, #0056b3); transition: width 0.3s ease; }
        .progress-text { font-size: 12px; color: #666; }
        .add-queue-btn { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .add-queue-btn:hover { background: #005a99; }
        .loading-state { text-align: center; padding: 10px; color: #666; font-style: italic; }
      </style>
      <div class="content"></div>
    `;
  }
}

customElements.define('trait-card', TraitCard);