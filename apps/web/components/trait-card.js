import { useTraitStore } from '../lib/trait-store.js';
import './risk-distribution.js';
import './quantitative-display.js';
import { hasConversions, getAvailableUnits, convertValue, getDefaultUnit } from '../lib/unit-converter.js';
import './pgs-breakdown.js';

export class TraitCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.trait = null;
    this.individualId = null;
    this.unsubscribe = null;
    this.selectedUnit = null; // Track selected unit for conversion
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

  setData(trait, individualId, individualEmoji) {
    this.trait = trait;
    this.individualId = individualId;
    this.individualEmoji = individualEmoji || '👤';
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
        // Load other individuals' results for comparison if not already present
        if (!cached.otherIndividuals || cached.otherIndividuals.length === 0) {
          cached.otherIndividuals = await this.loadOtherIndividualsResults();
        }
        useTraitStore.getState().setTraitCache(this.trait.id, cached);
      }
    } catch (error) {
      // Silently fail - card will show "Add to Queue" button
    } finally {
      useTraitStore.getState().setTraitLoading(this.trait.id, false);
    }
  }

  async loadOtherIndividualsResults() {
    const processor = window.__asiliProcessor;
    if (!processor?.localProcessor?.unifiedProcessor?.storage) return [];

    try {
      const { useAppStore } = await import('../lib/store.js');
      const appState = useAppStore.getState();
      const allIndividuals = appState.individuals || [];
      const otherIndividuals = allIndividuals.filter(ind => 
        ind.id !== this.individualId && (ind.status === 'ready' || ind.status === 'complete')
      );

      const storage = processor.localProcessor.unifiedProcessor.storage;
      const results = [];

      for (const individual of otherIndividuals) {
        try {
          const cached = await storage.getCachedRiskScore(individual.id, this.trait.id);
          if (cached && cached.value !== null && cached.value !== undefined) {
            results.push({
              name: individual.name,
              emoji: individual.emoji || '👤',
              value: cached.value,
              zScore: cached.zScore,
              matchedVariants: cached.matchedVariants,
              marginOfError: this.calculateMarginOfErrorForIndividual(cached)
            });
          }
        } catch (error) {
          // Skip individuals without cached results
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to load other individuals:', error);
      return [];
    }
  }

  calculateMarginOfErrorForIndividual(cached) {
    const r2 = cached.bestPGSPerformance || 0.05;
    const phenotypeSd = this.trait.phenotype_sd || 0;
    const matchedVariants = cached.matchedVariants || 0;
    const totalVariants = cached.totalVariants || 1;
    const coverage = matchedVariants / totalVariants;
    return phenotypeSd * Math.sqrt(1 - r2) * Math.sqrt(1 - coverage);
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

      const unitBtn = e.target.closest('.unit-btn');
      if (unitBtn) {
        this.selectedUnit = unitBtn.dataset.unit;
        this.updateDisplay();
      }
    });
  }

  subscribeToTraitStore() {
    let previousState = null;
    this.unsubscribe = useTraitStore.subscribe(() => {
      if (!this.trait) return;
      const currentState = useTraitStore.getState().getTraitState(this.trait.id);
      // Only update if THIS trait's state changed (reference equality check)
      if (currentState !== previousState) {
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
        ${this.trait.emoji ? `<span class="trait-emoji">${this.trait.emoji}</span>` : ''}
        <h3>${this.trait.name}</h3>
        <span class="category">${this.trait.categories?.[0] || 'Other'}</span>
      </div>
      ${this.trait.description ?
        `<div class="description">${this.trait.description}</div>` : ''}
      <div class="stats">${this.trait.pgs_count || 0} PGS | ${this.trait.variant_count?.toLocaleString() || '?'} variants</div>
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
    const isQuantitative = this.trait.trait_type === 'quantitative' && this.trait.unit;
    
    // Use z-score and confidence from backend calculation
    const overallZScore = cached.zScore ?? this.calculateOverallZScore(cached.pgsDetails);
    const percentile = Math.round(cached.percentile ?? this.zScoreToPercentile(overallZScore));
    const confidence = cached.confidence || 'medium';
    const level = percentile >= 70 ? 'high' : percentile <= 30 ? 'low' : 'medium';
    
    let bestPGS = cached.bestPGS;
    let bestPGSPerformance = cached.bestPGSPerformance;
    if (!bestPGS && cached.pgsDetails) {
      let maxPerf = 0;
      Object.entries(cached.pgsDetails).forEach(([pgsId, details]) => {
        if (details.performanceMetric && details.performanceMetric > maxPerf && !details.insufficientData) {
          maxPerf = details.performanceMetric;
          bestPGS = pgsId;
          bestPGSPerformance = maxPerf;
        }
      });
    }

    return `
      <div class="results">
        ${isQuantitative ? `
          <div class="score">${this.getDisplayValue(cached.value, this.trait.unit)} ${this.getDisplayUnit()}</div>
          <div class="percentile">${this.formatPercentile(percentile)}</div>
          ${this.renderUnitSwitcher()}
        ` : `
          <div class="score">${this.formatZScore(overallZScore)}</div>
          <div class="percentile">${this.formatPercentile(percentile)}</div>
          <div class="level ${level}">${level} risk</div>
        `}
        <div class="confidence confidence-${confidence}">${this.formatConfidence(confidence)}</div>
        ${bestPGS && bestPGSPerformance ? `
          <div class="best-pgs">Based on ${bestPGS} (R²: ${(bestPGSPerformance * 100).toFixed(1)}%)</div>
        ` : ''}
        
        ${isQuantitative ? `
          <quantitative-display 
            value="${this.getDisplayValue(cached.value, this.trait.unit)}" 
            unit="${this.getDisplayUnit()}" 
            emoji="${this.individualEmoji}" 
            margin-of-error="${this.getDisplayValue(this.calculateMarginOfError(cached), this.trait.unit)}" 
            phenotype-mean="${cached.phenotype_mean || this.trait.phenotype_mean || ''}" 
            phenotype-sd="${cached.phenotype_sd || this.trait.phenotype_sd || ''}" 
            reference-population="${cached.reference_population || this.trait.reference_population || ''}" 
            other-individuals='${JSON.stringify(this.convertOtherIndividuals(cached.otherIndividuals || [], cached))}'>
          </quantitative-display>
        ` : `
          <risk-distribution score="${overallZScore}" emoji="${this.individualEmoji}" other-individuals='${JSON.stringify(cached.otherIndividuals || [])}'></risk-distribution>
        `}
        
        <div class="stats">
          ${this.formatNumber(cached.matchedVariants)} of ${this.formatNumber(cached.totalVariants)} variants matched (${((cached.matchedVariants / cached.totalVariants) * 100).toFixed(1)}%)<br>
          <div style="text-align: left; margin-top: 5px;">Calculated ${new Date(cached.calculatedAt).toLocaleDateString()}</div>
        </div>
        ${this.renderPgsList(cached.pgsBreakdown, cached.pgsDetails, bestPGS)}
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

  renderPgsList(pgsBreakdown, pgsDetails, bestPGS) {
    if (!pgsBreakdown) return '';

    // Sort by sort_order from backend (stored in pgsDetails metadata)
    const entries = Object.entries(pgsBreakdown)
      .filter(([_, data]) => Math.abs(data.positiveSum + data.negativeSum) >= 0.005)
      .sort((a, b) => {
        const orderA = pgsDetails?.[a[0]]?.sortOrder ?? 999;
        const orderB = pgsDetails?.[b[0]]?.sortOrder ?? 999;
        return orderA - orderB;
      });

    return `
      <div class="pgs-list">
        ${entries.map(([pgsId, data]) => {
      const score = data.positiveSum + data.negativeSum;
      const details = pgsDetails?.[pgsId];
      const name = details?.metadata?.name || this.trait?.pgs_metadata?.[pgsId]?.name || pgsId;
      const performance = details?.performanceMetric;
      const confidence = details?.confidence || 'medium';
      const confidenceTooltip = this.getConfidenceTooltip(confidence, details?.matchedVariants, details?.totalVariants);
      const isBest = pgsId === bestPGS && !details?.insufficientData;
      const absPositive = Math.abs(data.positiveSum);
      const absNegative = Math.abs(data.negativeSum);
      const total = absPositive + absNegative;
      const negPct = total > 0 ? (absNegative / total) * 100 : 0;
      const posPct = total > 0 ? (absPositive / total) * 100 : 0;
      const scoreColor = score >= 0 ? '#721c24' : '#155724';

      return `<div class="pgs-item ${isBest ? 'best-pgs-item' : ''} ${details?.insufficientData ? 'insufficient-data' : ''}" data-pgs-id="${pgsId}">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px;">
              <span style="display: flex; align-items: center; gap: 4px;">
                ${isBest ? '<span title="Best performing score with sufficient data (≥8 variants matched)">⭐</span>' : ''}
                ${name}
                ${performance ? `<span class="performance-badge" title="R² performance metric: ${(performance * 100).toFixed(1)}% - measures how well this score predicts the trait">${(performance * 100).toFixed(0)}%</span>` : ''}
                <span class="confidence-badge confidence-${confidence}" title="${confidenceTooltip}">${confidence}</span>
              </span>
              <span class="score" style="color: ${scoreColor}">${(() => {
                // For quantitative traits with value, show the actual value instead of z-score
                if (this.trait?.trait_type === 'quantitative' && details?.value !== null && details?.value !== undefined) {
                  const unit = this.trait?.unit || '';
                  return `${details.value.toFixed(2)}${unit ? ' ' + unit : ''}`;
                } else if (details?.zScore !== null && details?.zScore !== undefined) {
                  return this.formatZScore(details.zScore);
                } else {
                  return this.formatScore(score);
                }
              })()}</span>
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



  calculateOverallZScore(pgsDetails) {
    if (!pgsDetails) return 0;
    
    // Calculate mean of individual PGS z-scores (simple average)
    const zScores = Object.values(pgsDetails)
      .map(details => details.zScore)
      .filter(z => z !== null && z !== undefined && !isNaN(z));
    
    if (zScores.length === 0) return 0;
    
    const mean = zScores.reduce((sum, z) => sum + z, 0) / zScores.length;
    return mean;
  }

  zScoreToPercentile(zScore) {
    // Use error function approximation for normal CDF
    const erf = (x) => {
      const sign = x >= 0 ? 1 : -1;
      x = Math.abs(x);
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return sign * y;
    };
    
    const percentile = 0.5 * (1 + erf(zScore / Math.sqrt(2))) * 100;
    return Math.round(Math.max(1, Math.min(99, percentile)));
  }

  formatZScore(zScore) {
    const abs = Math.abs(zScore);
    const sign = zScore >= 0 ? '+' : '';
    return `${sign}${zScore.toFixed(2)}σ`;
  }

  formatScore(score) {
    const abs = Math.abs(score);
    const sign = score >= 0 ? '+' : '';
    return abs >= 10 ? `${sign}${score.toFixed(2)}` : `${sign}${score.toFixed(3)}`;
  }

  formatPercentile(percentile) {
    const suffix = percentile % 10 === 1 && percentile !== 11 ? 'st' : percentile % 10 === 2 && percentile !== 12 ? 'nd' : percentile % 10 === 3 && percentile !== 13 ? 'rd' : 'th';
    return `${percentile}${suffix} percentile`;
  }

  getDisplayUnit() {
    if (!this.selectedUnit && this.trait?.unit) {
      // Initialize with locale default on first access
      this.selectedUnit = getDefaultUnit(this.trait.unit);
    }
    return this.selectedUnit || this.trait?.unit || '';
  }

  getDisplayValue(value, originalUnit) {
    if (value === undefined || value === null) return '—';
    const displayUnit = this.getDisplayUnit();
    const converted = convertValue(value, originalUnit, displayUnit);
    return converted.toFixed(2);
  }

  convertOtherIndividuals(others, cached) {
    const displayUnit = this.getDisplayUnit();
    const phenotypeSd = this.trait.phenotype_sd || 0;
    const r2 = cached?.bestPGSPerformance || 0.05;
    
    return others.map(ind => {
      // Calculate per-individual margin based on their matched variants
      const coverage = (ind.matchedVariants || 0) / (cached?.totalVariants || 1);
      const margin = phenotypeSd * Math.sqrt(1 - r2) * Math.sqrt(1 - coverage);
      
      return {
        ...ind,
        value: convertValue(ind.value, this.trait.unit, displayUnit),
        marginOfError: convertValue(margin, this.trait.unit, displayUnit)
      };
    });
  }

  calculateMarginOfError(cached) {
    // Calculate margin based on R² and matched variants
    const r2 = cached.bestPGSPerformance || 0.05;
    const phenotypeSd = this.trait.phenotype_sd || 0;
    const matchedVariants = cached.matchedVariants || 0;
    const totalVariants = cached.totalVariants || 1;
    const coverage = matchedVariants / totalVariants;
    
    // Margin = phenotype_sd × √(1 - R²) × √(1 - coverage)
    // Lower coverage = higher uncertainty
    const margin = phenotypeSd * Math.sqrt(1 - r2) * Math.sqrt(1 - coverage);
    return margin;
  }

  renderUnitSwitcher() {
    if (!this.trait?.unit || !hasConversions(this.trait.unit)) return '';
    
    const availableUnits = getAvailableUnits(this.trait.unit);
    const currentUnit = this.getDisplayUnit();
    
    return `
      <div class="unit-switcher">
        ${availableUnits.map(unit => `
          <button class="unit-btn ${unit === currentUnit ? 'active' : ''}" data-unit="${unit}">${unit}</button>
        `).join('')}
      </div>
    `;
  }

  formatConfidence(confidence) {
    const labels = {
      none: '⚠️ No data',
      insufficient: '❌ Insufficient data',
      low: '⚠️ Low confidence',
      medium: 'Medium confidence',
      high: '✓ High confidence'
    };
    return labels[confidence] || confidence;
  }

  getConfidenceTooltip(confidence, matchedVariants, totalVariants) {
    const matchRate = matchedVariants && totalVariants ? `${((matchedVariants / totalVariants) * 100).toFixed(0)}%` : 'unknown';
    const variantInfo = matchedVariants ? `${matchedVariants} variants matched` : 'no variants matched';
    const tooltips = {
      none: 'No genetic data matched for this score',
      insufficient: `Insufficient data: Only ${matchedVariants || 0} variants matched (minimum 8 required). This score should not be used for risk assessment.`,
      low: `Low confidence: ${variantInfo}. High performance with low confidence means the score is accurate when all variants are present, but your result may be less reliable due to missing data.`,
      medium: `Medium confidence: ${variantInfo} (${matchRate} match rate). Result is reasonably reliable.`,
      high: `High confidence: ${variantInfo} (${matchRate} match rate). Result is highly reliable with excellent data coverage.`
    };
    return tooltips[confidence] || `Confidence: ${confidence}`;
  }

  formatNumber(num) {
    if (num === 0) return '0';
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
        .trait-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }
        .trait-emoji { font-size: 24px; flex-shrink: 0; }
        .trait-header h3 { margin: 0; font-size: 18px; flex: 1; }
        .category { font-size: 12px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
        .stats { font-size: 11px; color: #666; margin: 10px 0; text-align: center; font-style: italic; }
        .results { text-align: center; }
        .score { font-size: 2em; font-weight: bold; color: #007acc; }
        .percentile { color: #666; margin: 5px 0; }
        .level { padding: 4px 8px; border-radius: 4px; font-size: 12px; margin: 5px 0; }
        .low { background: #d4edda; color: #155724; }
        .medium { background: #fff3cd; color: #856404; }
        .high { background: #f8d7da; color: #721c24; }
        .confidence { font-size: 11px; margin: 5px 0; padding: 3px 6px; border-radius: 3px; }
        .confidence-none { background: #f8d7da; color: #721c24; }
        .confidence-insufficient { background: #f8d7da; color: #721c24; font-weight: 600; }
        .confidence-low { background: #fff3cd; color: #856404; }
        .confidence-medium { background: #e7f3ff; color: #004085; }
        .confidence-high { background: #d4edda; color: #155724; }
        .best-pgs { font-size: 11px; color: #666; margin: 5px 0; font-style: italic; }
        .best-pgs-item { border-left: 3px solid #ffc107; padding-left: 5px; }
        .performance-badge { font-size: 9px; background: #007acc; color: white !important; padding: 1px 4px; border-radius: 2px; }
        .confidence-badge { font-size: 9px; padding: 1px 4px; border-radius: 2px; }
        .confidence-badge.confidence-none { background: #f8d7da; color: #721c24; }
        .confidence-badge.confidence-insufficient { background: #f8d7da; color: #721c24; font-weight: 600; }
        .confidence-badge.confidence-low { background: #fff3cd; color: #856404; }
        .confidence-badge.confidence-medium { background: #e7f3ff; color: #004085; }
        .confidence-badge.confidence-high { background: #d4edda; color: #155724; }
        .pgs-list { margin-top: 15px; max-height: 200px; overflow-y: auto; overflow-x: hidden; padding-right: 8px; }
        .pgs-item { margin-bottom: 8px; cursor: pointer; }
        .pgs-item:hover { background: #f8f9fa; }
        .pgs-item.insufficient-data { opacity: 0.6; background: #fff5f5; border-left: 2px solid #f8d7da; padding-left: 3px; }
        .pgs-item span:first-child { font-size: 11px; color: #007acc; font-weight: 500; max-width: 85%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pgs-item .score { font-size: 11px; font-weight: bold; }
        .queue-status { text-align: center; padding: 10px; background: #fff3cd; border-radius: 4px; }
        .queue-label { font-weight: 500; margin-bottom: 8px; }
        .progress-bar { width: 100%; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin: 8px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #007acc, #0056b3); transition: width 0.3s ease; }
        .progress-text { font-size: 12px; color: #666; }
        .add-queue-btn { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .add-queue-btn:hover { background: #005a99; }
        .loading-state { text-align: center; padding: 10px; color: #666; font-style: italic; }
        .unit-switcher { display: flex; gap: 5px; justify-content: center; margin: 8px 0; }
        .unit-btn { padding: 4px 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s; }
        .unit-btn:hover { background: #e0e0e0; }
        .unit-btn.active { background: #007acc; color: white; border-color: #007acc; }
      </style>
      <div class="content"></div>
    `;
  }
}

customElements.define('trait-card', TraitCard);