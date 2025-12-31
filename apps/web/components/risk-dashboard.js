import { Debug } from '@asili/debug';
import { useAppStore } from '../lib/store.js';
import './pgs-breakdown.js';

// Format PGS scores as standard deviations (not multipliers)
function formatScore(score) {
    const abs = Math.abs(score);
    const sign = score >= 0 ? '+' : '';
    
    if (abs >= 10) {
        return `${sign}${score.toFixed(1)}σ`;
    } else {
        return `${sign}${score.toFixed(2)}σ`;
    }
}

// Convert standard deviation to percentile for user-friendly display
function scoreToPercentile(score) {
    // Using cumulative normal distribution approximation
    const z = Math.abs(score);
    let percentile;
    
    if (z < 1) {
        percentile = 50 + (z * 34.13);
    } else if (z < 2) {
        percentile = 84.13 + ((z - 1) * 13.59);
    } else if (z < 3) {
        percentile = 97.72 + ((z - 2) * 2.14);
    } else {
        percentile = 99.87;
    }
    
    if (score < 0) {
        percentile = 100 - percentile;
    }
    
    return Math.round(Math.max(1, Math.min(99, percentile)));
}

// Format percentile with correct ordinal suffix
function formatPercentile(percentile) {
    const suffix = percentile % 10 === 1 && percentile !== 11 ? 'st' :
                  percentile % 10 === 2 && percentile !== 12 ? 'nd' :
                  percentile % 10 === 3 && percentile !== 13 ? 'rd' : 'th';
    return `${percentile}${suffix} percentile`;
}

export class RiskDashboard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.processor = null;
        this.availableTraits = [];
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.render();
        this.initializeProcessor();
        
        // Subscribe to state changes
        this.unsubscribe = useAppStore.subscribe((state) => {
            this.updateTraitCards(state);
        });
    }

    async initializeProcessor() {
        try {
            // Create our own processor instance
            const { AsiliProcessor } = await import('../lib/asili-processor.js');
            this.processor = new AsiliProcessor();
            await this.processor.initialize();
            await this.loadAvailableTraits();
        } catch (error) {
            Debug.error('RiskDashboard', 'Failed to initialize processor:', error);
        }
    }

    disconnectedCallback() {
        this.unsubscribe?.();
    }

    updateTraitCards(state) {
        const grid = this.shadowRoot.getElementById('traitsGrid');
        if (!grid || this.availableTraits.length === 0) return;
        
        Debug.log(1, 'RiskDashboard', 'Updating trait cards for individual:', state.selectedIndividual);
        
        if (!state.selectedIndividual) {
            if (state.individuals.length === 0) {
                grid.innerHTML = '<div class="loading">Add an individual to start analyzing risk</div>';
            } else {
                grid.innerHTML = '<div class="loading">Select an individual to view trait analysis</div>';
            }
            return;
        }
        
        if (state.uploadState !== 'idle' || !state.individualReady) {
            grid.innerHTML = '<div class="loading">Individual data is loading...</div>';
            return;
        }
        
        this.renderTraitCardsForIndividual(state.selectedIndividual);
    }

    async renderTraitCardsForIndividual(individualId) {
        const grid = this.shadowRoot.getElementById('traitsGrid');
        grid.innerHTML = '';
        
        if (this.availableTraits.length === 0) {
            grid.innerHTML = '<div class="loading">No traits available</div>';
            return;
        }
        
        // Group traits by family
        const familyGroups = {};
        this.availableTraits.forEach(trait => {
            if (!familyGroups[trait.category]) {
                familyGroups[trait.category] = [];
            }
            familyGroups[trait.category].push(trait);
        });
        
        const traitFamilies = this.processor.getTraitFamilies();
        
        for (const [familyKey, traits] of Object.entries(familyGroups)) {
            const family = traitFamilies[familyKey];
            if (!family) continue;
            
            // Create family header
            const familyHeader = document.createElement('div');
            familyHeader.className = 'family-header';
            familyHeader.innerHTML = `
                <h2>${family.name}</h2>
                <p>${family.description}</p>
            `;
            grid.appendChild(familyHeader);
            
            // Create family grid
            const familyGrid = document.createElement('div');
            familyGrid.className = 'family-grid';
            
            for (const trait of traits) {
                Debug.log(2, 'RiskDashboard', 'Creating card for trait:', trait.name);
                const cached = await this.processor.getCachedResult(individualId, trait.id);
                const card = this.createTraitCard(trait, individualId, cached);
                familyGrid.appendChild(card);
            }
            
            grid.appendChild(familyGrid);
        }
    }

    createTraitCard(trait, individualId, cached) {
        const card = document.createElement('div');
        card.className = 'trait-card';
        card.dataset.traitId = trait.id;
        card.dataset.individualId = individualId;
        
        card.innerHTML = `
            <div class="trait-header">
                <h3 class="trait-name">${trait.name}</h3>
                <span class="trait-category">${trait.category}</span>
            </div>
            <div class="trait-stats">
                ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Unknown'} variants
            </div>
            ${cached ? this.renderCachedResult(cached, individualId) : this.renderAnalyzeButton(trait.id, individualId)}
        `;
        
        return card;
    }

    async loadAvailableTraits() {
        Debug.log(1, 'RiskDashboard', 'loadAvailableTraits starting');
        const grid = this.shadowRoot.getElementById('traitsGrid');
        if (!grid) {
            Debug.log(1, 'RiskDashboard', 'No grid found in loadAvailableTraits');
            return;
        }
        
        grid.innerHTML = '<div class="loading">Loading traits...</div>';
        
        try {
            if (!this.processor) {
                throw new Error('Processor not available');
            }
            
            // Get trait families from processor
            const traitFamilies = this.processor.getTraitFamilies();
            this.availableTraits = this.processor.getAllTraits();
            
            Debug.log(1, 'RiskDashboard', 'Loaded traits from processor:', this.availableTraits.length);
            useAppStore.getState().setTraitsLoaded(true);
            
            // Show message to add individual or trigger update if individual exists
            const state = useAppStore.getState();
            this.updateTraitCards(state);
            
        } catch (error) {
            Debug.error('RiskDashboard', 'Failed to load traits:', error);
            grid.innerHTML = '<div class="loading">Failed to load traits</div>';
        }
    }

    renderCachedResult(cached, individualId) {
        if (!cached || typeof cached.riskScore !== 'number') {
            return '<div class="risk-display"><div class="loading">No data available</div></div>';
        }
        
        // Display PGS score as standard deviations from population mean
        const score = cached.riskScore;
        const percentile = scoreToPercentile(score);
        const level = percentile >= 70 ? 'high' : percentile <= 30 ? 'low' : 'medium';
        const levelText = percentile >= 70 ? 'Higher Risk' : percentile <= 30 ? 'Lower Risk' : 'Average Risk';
        
        return `
            <div class="risk-display">
                <div class="risk-score">${formatScore(score)}</div>
                <div class="risk-percentile">${formatPercentile(percentile)}</div>
                <div class="risk-level ${level}">${levelText}</div>
                <button class="refresh-btn" onclick="this.getRootNode().host.recalculateRisk(this)">↻</button>
            </div>
            <div class="trait-stats">
                ${cached.matchedVariants} matched of ${cached.totalVariants?.toLocaleString() || 'unknown'} variants<br>
                Calculated ${new Date(cached.calculatedAt).toLocaleDateString()}
            </div>
            ${cached.pgsBreakdown ? this.renderPgsBreakdown(cached.pgsBreakdown, individualId) : ''}
        `;
    }

    renderAnalyzeButton(traitId, individualId) {
        return `
            <div class="risk-display">
                <button class="analyze-btn" onclick="this.getRootNode().host.analyzeRisk('${traitId}', '${individualId}', this)">
                    <span>Calculate Risk</span>
                </button>
            </div>
        `;
    }

    renderPgsBreakdown(pgsBreakdown, individualId) {
        if (!pgsBreakdown || typeof pgsBreakdown !== 'object') return '';
        
        const entries = Object.entries(pgsBreakdown)
            .filter(([_, data]) => (data.positive > 0 || data.negative > 0))
            .filter(([_, data]) => Math.abs(data.positiveSum + data.negativeSum) >= 0.005)
            .sort(([_, a], [__, b]) => (Math.abs(b.positiveSum + b.negativeSum)) - (Math.abs(a.positiveSum + a.negativeSum)));
        
        if (entries.length === 0) return '';
        
        return `
            <div class="pgs-breakdown">
                <div class="breakdown-title">PGS Score Breakdown:</div>
                <div class="pgs-list">
                    ${entries.map(([pgsId, data]) => {
                        const netScore = data.positiveSum + data.negativeSum;
                        const absPositive = Math.abs(data.positiveSum);
                        const absNegative = Math.abs(data.negativeSum);
                        const total = absPositive + absNegative;
                        
                        const negPct = total > 0 ? (absNegative / total * 100) : 0;
                        const posPct = total > 0 ? (absPositive / total * 100) : 0;
                        
                        const scoreColor = netScore >= 0 ? '#721c24' : '#155724';
                        
                        return `
                            <div class="pgs-item" onclick="this.getRootNode().host.showPGSBreakdown('${pgsId}', '${individualId}', this)" style="cursor: pointer;">
                                <div class="pgs-header">
                                    <span class="pgs-name">${data.metadata?.name || pgsId}</span>
                                    <div class="pgs-score" style="color: ${scoreColor}">${formatScore(netScore)}</div>
                                </div>
                                <div class="pgs-bar" title="View detailed calculation">
                                    <div class="pgs-negative" style="width: ${negPct}%" title="${data.negative} variants: ${formatScore(data.negativeSum)}"></div>
                                    <div class="pgs-positive" style="width: ${posPct}%" title="${data.positive} variants: ${formatScore(data.positiveSum)}"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    async showPGSBreakdown(pgsId, individualId, buttonElement) {
        Debug.log(1, 'RiskDashboard', 'showPGSBreakdown start:', pgsId);
        
        // Get trait card from button element
        const card = buttonElement.closest('.trait-card');
        const traitId = card?.dataset.traitId;
        
        Debug.log(2, 'RiskDashboard', 'Fetching cached risk for:', traitId);
        const cached = traitId ? await this.processor.getCachedResult(individualId, traitId) : null;
        
        if (cached?.pgsBreakdown && cached?.pgsDetails?.[pgsId]) {
            // Store navigation context
            this.currentPgsNavigation = {
                traitId,
                individualId,
                pgsIds: Object.entries(cached.pgsBreakdown)
                    .filter(([_, data]) => (data.positive > 0 || data.negative > 0))
                    .filter(([_, data]) => Math.abs(data.positiveSum + data.negativeSum) >= 0.005)
                    .sort(([_, a], [__, b]) => (Math.abs(b.positiveSum + b.negativeSum)) - (Math.abs(a.positiveSum + a.negativeSum)))
                    .map(([id]) => id),
                currentIndex: 0
            };
            this.currentPgsNavigation.currentIndex = this.currentPgsNavigation.pgsIds.indexOf(pgsId);
            
            this.showPGSBreakdownInCard(pgsId, cached, individualId, card);
        } else {
            alert('PGS details not available. Please recalculate the risk.');
        }
    }
    
    showPGSBreakdownInCard(pgsId, cached, individualId, card) {
        Debug.log(1, 'RiskDashboard', 'showPGSBreakdownInCard start:', pgsId);
        
        const pgsBreakdown = card.querySelector('.pgs-breakdown');
        if (!pgsBreakdown) return;
        
        // Get trait metadata
        const traitId = card.dataset.traitId;
        const trait = this.availableTraits.find(t => t.id === traitId);
        const pgsMetadata = trait?.pgs_metadata?.[pgsId] || {};
        const metadata = { ...cached.pgsDetails[pgsId].metadata, ...pgsMetadata };
        
        Debug.log(2, 'RiskDashboard', 'Processing variants for PGS:', pgsId);
        const topVariants = cached.pgsDetails[pgsId].topVariants || [];
        
        // Calculate this PGS contribution to total trait score
        const pgsContribution = cached.pgsBreakdown[pgsId];
        const totalAbsMagnitude = Object.values(cached.pgsBreakdown).reduce((sum, pgs) => sum + Math.abs(pgs.positiveSum + pgs.negativeSum), 0);
        const pgsScore = pgsContribution.positiveSum + pgsContribution.negativeSum;
        const pgsPercentage = totalAbsMagnitude !== 0 ? Math.abs(pgsScore) / totalAbsMagnitude * 100 : 0;
        
        Debug.log(2, 'RiskDashboard', 'Rendering HTML content');
        pgsBreakdown.innerHTML = `
            <div class="breakdown-header">
                <button class="back-btn" onclick="this.getRootNode().host.showPGSList('${traitId}', '${individualId}')">← Back</button>
                <h4 style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; margin: 0; padding: 5px 0;">${metadata.name || metadata.pgs_name || pgsId}</h4>
                <div class="nav-buttons">
                    <button class="nav-btn" onclick="this.getRootNode().host.navigatePGS(-1)" ${this.currentPgsNavigation?.currentIndex === 0 ? 'disabled' : ''}>↑</button>
                    <button class="nav-btn" onclick="this.getRootNode().host.navigatePGS(1)" ${this.currentPgsNavigation?.currentIndex === (this.currentPgsNavigation?.pgsIds.length - 1) ? 'disabled' : ''}>↓</button>
                </div>
            </div>
            
            <a href="https://www.pgscatalog.org/score/${pgsId}" target="_blank" class="pgs-catalog-link" style="display: block; margin-bottom: 10px; font-size: 12px;">
                View on PGS Catalog →
            </a>
            
            <div class="pgs-contribution-box" style="background: linear-gradient(90deg, ${pgsScore >= 0 ? '#f8d7da' : '#d4edda'} ${pgsPercentage}%, #f8f9fa ${pgsPercentage}%); border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: ${pgsScore >= 0 ? '#721c24' : '#155724'};">${pgsPercentage.toFixed(1)}%</div>
                <div style="font-size: 11px; color: #666;">of total trait score</div>
            </div>
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; color: ${pgsScore >= 0 ? '#721c24' : '#155724'};">PGS Score: ${formatScore(pgsScore)}</div>
                <div style="font-size: 12px; color: #666; margin-top: 2px;">${formatPercentile(scoreToPercentile(pgsScore))}</div>
            </div>
            <div class="breakdown-content">
                <div class="pgs-summary">
                    <p class="trait-desc">${metadata.trait || metadata.trait_reported || 'Polygenic Score'}</p>
                    <div class="calc-summary">
                        <div class="calc-item">Contributing variants: ${pgsContribution.positive + pgsContribution.negative}</div>
                        <div class="calc-item">Total variants: ${pgsContribution.total}</div>
                    </div>
                </div>
                
                <div class="calculation-info">
                    <h5>Calculation Summary</h5>
                    <div style="font-size: 12px; line-height: 1.4; color: #555;">
                        <div>• Matched ${pgsContribution.positive + pgsContribution.negative} of ${pgsContribution.total} variants in this PGS</div>
                        <div>• ${pgsContribution.positive} variants increase risk (${pgsContribution.positiveSum >= 0 ? '+' : ''}${pgsContribution.positiveSum.toFixed(4)})</div>
                        <div>• ${pgsContribution.negative} variants decrease risk (${pgsContribution.negativeSum.toFixed(4)})</div>
                        <div style="font-weight: bold; margin-top: 8px;">• Net contribution: ${pgsScore >= 0 ? '+' : ''}${pgsScore.toFixed(4)}</div>
                    </div>
                </div>
                
                <div class="score-distribution">
                    <h5>Effect Weight Distribution</h5>
                    <canvas id="distributionChart-${pgsId}" width="300" height="150"></canvas>
                </div>
                
                <div class="variant-breakdown">
                    <h5>Top Contributing Variants</h5>
                    <div class="variant-table">
                        <div class="table-header">
                            <span>Variant</span>
                            <span>Your DNA</span>
                            <span>Effect Allele</span>
                            <span>Weight</span>
                        </div>
                        ${topVariants.map(variant => {
                            const variantId = variant.rsid || 'Unknown';
                            let displayId, linkUrl;
                            
                            if (variantId.startsWith('rs')) {
                                displayId = variantId;
                                linkUrl = `https://www.ncbi.nlm.nih.gov/snp/${variantId}`;
                            } else if (variantId.includes(':')) {
                                // Format chr:pos:ref:alt as more readable
                                const parts = variantId.split(':');
                                displayId = parts.length >= 3 ? `chr${parts[0]}:${parts[1]}` : variantId;
                                linkUrl = `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr${parts[0]}:${parts[1]}-${parts[1]}`;
                            } else {
                                displayId = variantId;
                                linkUrl = null;
                            }
                            
                            return `
                            <div class="table-row">
                                <span class="variant-id">${linkUrl ? `<a href="${linkUrl}" target="_blank">${displayId}</a>` : displayId}</span>
                                <span class="genotype">${variant.userGenotype || 'N/A'}</span>
                                <span class="effect-allele">${variant.effect_allele}</span>
                                <span class="effect-weight ${variant.effect_weight >= 0 ? 'positive' : 'negative'}">${variant.effect_weight >= 0 ? '+' : ''}${variant.effect_weight.toFixed(6)}</span>
                            </div>
                        `}).join('')}
                    </div>
                </div>
            </div>
        `;
        
        pgsBreakdown.classList.add('showing-detail');
        
        // Create distribution chart
        setTimeout(async () => {
            Debug.log(2, 'RiskDashboard', 'Attempting to create chart for:', `distributionChart-${pgsId}`);
            
            const canvas = this.shadowRoot.getElementById(`distributionChart-${pgsId}`);
            if (canvas) {
                // Create chart directly since we have the PGSBreakdown class available
                const pgsBreakdownComponent = new (await import('./pgs-breakdown.js')).PGSBreakdown();
                
                // Use cached distribution data if available, otherwise fall back to top variants
                const distributionData = cached.pgsDetails[pgsId]?.distribution || topVariants;
                await pgsBreakdownComponent.createDistributionChartOnCanvas(distributionData, canvas);
            } else {
                Debug.log(2, 'RiskDashboard', 'Canvas not found in shadow DOM');
            }
        }, 100);
        
        Debug.log(1, 'RiskDashboard', 'showPGSBreakdownInCard complete for:', pgsId);
    }
    
    async showPGSList(traitId, individualId) {
        const card = this.shadowRoot.querySelector(`[data-trait-id="${traitId}"]`);
        const cached = await this.processor.getCachedResult(individualId, traitId);
        
        if (card && cached) {
            const pgsBreakdown = card.querySelector('.pgs-breakdown');
            pgsBreakdown.innerHTML = this.renderPgsBreakdown(cached.pgsBreakdown, individualId);
            pgsBreakdown.classList.remove('showing-detail');
        }
        
        // Clear navigation context
        this.currentPgsNavigation = null;
    }
    
    navigatePGS(direction) {
        if (!this.currentPgsNavigation) return;
        
        const newIndex = this.currentPgsNavigation.currentIndex + direction;
        if (newIndex >= 0 && newIndex < this.currentPgsNavigation.pgsIds.length) {
            const newPgsId = this.currentPgsNavigation.pgsIds[newIndex];
            this.currentPgsNavigation.currentIndex = newIndex;
            
            // Find the card and show the new PGS
            const card = this.shadowRoot.querySelector(`[data-trait-id="${this.currentPgsNavigation.traitId}"]`);
            if (card) {
                this.showPGSBreakdownFromNavigation(newPgsId, this.currentPgsNavigation.individualId, card);
            }
        }
    }
    
    async showPGSBreakdownFromNavigation(pgsId, individualId, card) {
        const cached = await this.processor.getCachedResult(individualId, this.currentPgsNavigation.traitId);
        
        if (cached && cached.pgsDetails?.[pgsId]) {
            this.showPGSBreakdownInCard(pgsId, cached, individualId, card);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .family-header { margin: 30px 0 15px 0; }
                .family-header h2 { margin: 0 0 5px 0; color: #333; font-size: 24px; }
                .family-header p { margin: 0; color: #666; font-size: 14px; }
                .family-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; margin-bottom: 30px; }
                .trait-card {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 20px;
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .trait-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
                .trait-name { font-size: 18px; font-weight: bold; margin: 0; }
                .trait-category { font-size: 12px; color: #666; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                .risk-display { position: relative; text-align: center; margin: 15px 0; }
                .refresh-btn { position: absolute; top: 5px; right: 5px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; width: 24px; height: 24px; font-size: 14px; cursor: pointer; }
                .refresh-btn:hover { background: #e0e0e0; }
                .risk-score { font-size: 2em; font-weight: bold; color: #007acc; }
                .risk-percentile { font-size: 0.9em; color: #666; margin-top: 2px; }
                .risk-level { padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-top: 5px; }
                .low { background: #d4edda; color: #155724; }
                .medium { background: #fff3cd; color: #856404; }
                .high { background: #f8d7da; color: #721c24; }
                .trait-stats { font-size: 12px; color: #666; margin-top: 10px; }
                .pgs-breakdown { margin-top: 15px; }
                .breakdown-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333; }
                .pgs-list { max-height: 200px; overflow-y: auto; }
                .pgs-item { margin-bottom: 8px; }
                .pgs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
                .pgs-bar { width: 100%; height: 16px; border: 1px solid #ddd; border-radius: 3px; overflow: hidden; }
                .pgs-negative { background: #d4edda; height: 100%; float: left; }
                .pgs-positive { background: #f8d7da; height: 100%; float: left; }
                .pgs-score { font-weight: bold; font-size: 11px; }
                .pgs-name { font-size: 11px; color: #007acc; font-weight: 500; }
                .pgs-item:hover { background: #f8f9fa; }
                .analyze-btn { position: relative; width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; overflow: hidden; }
                .analyze-btn:hover { background: #005a99; }
                .analyze-btn:disabled { background: #ccc; cursor: not-allowed; }
                .analyze-btn:disabled::before { width: var(--progress, 0%); }
                .analyze-btn::before { content: ''; position: absolute; top: 0; left: 0; height: 100%; background: rgba(255,255,255,0.3); width: 0%; transition: width 0.3s ease; z-index: 1; }
                .analyze-btn.progress::before { width: var(--progress, 0%); }
                .analyze-btn span { position: relative; z-index: 2; }
                .analyze-btn.loading span::after { content: ''; display: inline-block; width: 12px; height: 12px; margin-left: 8px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; }
                .analyze-btn.progress span::after { content: '⚡'; margin-left: 8px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .loading { color: #666; font-style: italic; }
                .error-message { margin-top: 10px; padding: 8px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
                .error-text { font-size: 12px; color: #721c24; margin-bottom: 5px; }
                .retry-btn { font-size: 11px; padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; }
                .retry-btn:hover { background: #c82333; }
                .breakdown-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
                .back-btn { background: none; border: none; cursor: pointer; font-size: 16px; color: #007acc; }
                .back-btn:hover { color: #005a99; }
                .nav-buttons { margin-left: auto; display: flex; gap: 5px; }
                .nav-btn { background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; width: 24px; height: 24px; font-size: 14px; cursor: pointer; }
                .nav-btn:hover:not(:disabled) { background: #e0e0e0; }
                .nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .breakdown-content { max-height: 400px; overflow-y: auto; padding: 5px 0; }
                .pgs-summary { margin-bottom: 15px; }
                .trait-desc { font-style: italic; color: #666; margin: 0 0 8px 0; font-size: 12px; }
                .calc-summary { display: flex; gap: 15px; }
                .calc-item { font-size: 11px; color: #555; }
                .calculation-info { margin: 15px 0; }
                .calculation-info h5 { margin: 0 0 5px 0; font-size: 12px; }
                .calculation-info p { margin: 0; font-size: 11px; color: #666; line-height: 1.4; }
                .variant-breakdown { margin: 15px 0; }
                .variant-table { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
                .table-header { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; background: #f5f5f5; padding: 8px; font-weight: bold; font-size: 11px; }
                .table-header span:nth-child(2), .table-header span:nth-child(3) { text-align: center; }
                .table-header span:nth-child(4) { text-align: right; }
                .table-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
                .variant-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .variant-id a { color: #007acc; text-decoration: none; font-family: monospace; }
                .variant-id a:hover { text-decoration: underline; }
                .genotype { font-family: monospace; font-weight: bold; color: #2e7d32; text-align: center; }
                .effect-allele { font-family: monospace; color: #d32f2f; font-weight: bold; text-align: center; }
                .effect-weight { font-family: monospace; text-align: right; }
                .effect-weight.positive { color: #721c24; }
                .effect-weight.negative { color: #155724; }
                .pgs-catalog-link { color: #007acc; text-decoration: none; font-size: 12px; }
                .pgs-catalog-link:hover { text-decoration: underline; }
                .score-distribution { margin: 15px 0; }
                .score-distribution h5 { margin: 0 0 10px 0; font-size: 12px; }
                .score-distribution canvas { max-width: 100%; height: auto; }
            </style>
            <div id="traitsGrid" class="traits-container">
                <div class="loading">Loading traits...</div>
            </div>
        `;
    }

    async analyzeRisk(traitId, individualId, buttonElement) {
        Debug.log(1, 'RiskDashboard', `Starting risk analysis for trait: ${traitId}, individual: ${individualId}`);
        
        if (!this.processor) {
            Debug.error('RiskDashboard', 'Processor not initialized');
            return;
        }
        
        const trait = this.availableTraits.find(t => t.id === traitId);
        if (!trait) {
            Debug.error('RiskDashboard', `Trait not found: ${traitId}`);
            return;
        }
        
        Debug.log(2, 'RiskDashboard', `Found trait: ${trait.name} with ${trait.variant_count} variants`);
        
        // Clear any existing error messages
        const card = buttonElement.closest('.trait-card');
        const existingError = card.querySelector('.error-message');
        if (existingError) existingError.remove();
        
        buttonElement.classList.add('loading');
        buttonElement.textContent = 'Initializing...';
        buttonElement.disabled = true;
        
        try {
            const result = await this.processor.calculateTraitRisk(traitId, individualId, (message, percent) => {
                const span = buttonElement.querySelector('span');
                if (span) {
                    span.textContent = `${message} (${Math.round(percent)}%)`;
                } else {
                    buttonElement.textContent = `${message} (${Math.round(percent)}%)`;
                }
                buttonElement.classList.remove('loading');
                buttonElement.classList.add('progress');
                buttonElement.style.setProperty('--progress', `${percent}%`);
            });
            
            Debug.log(1, 'RiskDashboard', `Risk calculation complete for ${trait.name}. Score: ${result.riskScore}`);
            buttonElement.textContent = 'Complete!';
            
            // Update the card with results using the same method as cached results
            card.innerHTML = `
                <div class="trait-header">
                    <h3 class="trait-name">${trait.name}</h3>
                    <span class="trait-category">${trait.category}</span>
                </div>
                <div class="trait-stats">
                    ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Unknown'} variants
                </div>
                ${this.renderCachedResult(result, individualId)}
            `;
            
        } catch (error) {
            Debug.error('RiskDashboard', `Risk calculation failed for ${traitId}:`, error.message);
            
            // Reset button state
            buttonElement.classList.remove('loading', 'progress');
            buttonElement.textContent = 'Calculate Risk';
            buttonElement.disabled = false;
            buttonElement.style.backgroundColor = '';
            
            // Add error message below button
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            
            let errorText = error.message;
            if (error.message.includes('out of memory')) {
                errorText = 'Memory limit exceeded. This trait has too many variants to process in the browser.';
            } else if (error.message.includes('Data cannot be cloned')) {
                errorText = 'Data too large to store. Try a smaller trait or refresh the page.';
            }
            
            errorDiv.innerHTML = `
                <div class="error-text">${errorText}</div>
                <button class="retry-btn" onclick="this.getRootNode().host.analyzeRisk('${traitId}', '${individualId}', this.parentElement.parentElement.querySelector('.analyze-btn'))">Retry</button>
            `;
            
            // Insert error message after the risk-display div
            const riskDisplay = card.querySelector('.risk-display');
            if (riskDisplay) {
                riskDisplay.insertAdjacentElement('afterend', errorDiv);
            }
        }
    }
    
    recalculateRisk(buttonElement) {
        const card = buttonElement.closest('.trait-card');
        const traitId = card.dataset.traitId;
        const individualId = card.dataset.individualId;
        
        if (traitId && individualId) {
            const trait = this.availableTraits.find(t => t.id === traitId);
            if (trait) {
                card.innerHTML = `
                    <div class="trait-header">
                        <h3 class="trait-name">${trait.name}</h3>
                        <span class="trait-category">${trait.category}</span>
                    </div>
                    <div class="trait-stats">
                        ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Unknown'} variants
                    </div>
                    ${this.renderAnalyzeButton(traitId, individualId)}
                `;
            }
        }
    }
}

customElements.define('risk-dashboard', RiskDashboard);