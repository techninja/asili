import { Debug } from '../lib/debug.js';
import { MemoryMonitor } from '../lib/memory-monitor.js';
import { useAppStore } from '../lib/store.js';
import './pgs-breakdown.js';

export class RiskDashboard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
        this.geneticDb = null;
        this.availableTraits = [];
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.render();
        this.loadAvailableTraits();
        
        // Subscribe to state changes
        this.unsubscribe = useAppStore.subscribe((state) => {
            this.updateTraitCards(state);
        });
    }

    disconnectedCallback() {
        this.unsubscribe?.();
    }

    updateTraitCards(state) {
        if (!this.geneticDb || !state.traitsLoaded) return;
        
        const grid = this.shadowRoot.getElementById('traitsGrid');
        if (!grid) return;
        
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
        
        this.renderTraitCardsForIndividual(state.selectedIndividual, state.duckdbReady);
    }

    async renderTraitCardsForIndividual(individualId, duckdbReady) {
        const grid = this.shadowRoot.getElementById('traitsGrid');
        grid.innerHTML = '';
        
        if (this.availableTraits.length === 0) {
            grid.innerHTML = '<div class="loading">No traits available</div>';
            return;
        }
        
        // Group traits by family
        const familyGroups = {};
        this.availableTraits.forEach(trait => {
            if (!familyGroups[trait.family]) {
                familyGroups[trait.family] = [];
            }
            familyGroups[trait.family].push(trait);
        });
        
        for (const [familyKey, traits] of Object.entries(familyGroups)) {
            const family = this.traitCatalog.trait_families[familyKey];
            
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
                const cached = await this.geneticDb.getCachedRisk(trait.id, individualId);
                const card = this.createTraitCard(trait, individualId, cached, duckdbReady);
                familyGrid.appendChild(card);
            }
            
            grid.appendChild(familyGrid);
        }
    }

    createTraitCard(trait, individualId, cached, duckdbReady) {
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
            ${cached ? this.renderCachedResult(cached, individualId) : this.renderAnalyzeButton(trait.id, individualId, duckdbReady)}
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
            Debug.log(2, 'RiskDashboard', 'Fetching trait manifest...');
            const response = await fetch('/data/trait_manifest.json');
            Debug.log(1, 'RiskDashboard', 'Fetch response status:', response.status);
            const manifest = await response.json();
            Debug.log(2, 'RiskDashboard', 'Manifest loaded, trait_families:', !!manifest.trait_families);
            
            this.traitCatalog = manifest;
            this.availableTraits = [];
            
            if (!manifest.trait_families) {
                throw new Error('Invalid manifest');
            }
            
            // Flatten trait structure
            Object.entries(manifest.trait_families).forEach(([familyKey, family]) => {
                ['subtypes', 'biomarkers'].forEach(type => {
                    if (family[type]) {
                        Object.entries(family[type]).forEach(([key, item]) => {
                            const traitId = `${familyKey}_${key}`;
                            const manifestData = manifest.traits?.[traitId] || {};
                            
                            this.availableTraits.push({
                                id: traitId,
                                name: item.name,
                                description: item.description || '',
                                category: family.category,
                                family: familyKey,
                                familyName: family.name,
                                file_path: manifestData.file_path,
                                pgs_ids: item.pgs_ids,
                                pgs_metadata: manifestData.pgs_metadata || {},
                                variant_count: manifestData.variant_count || 0,
                                last_updated: manifestData.last_updated
                            });
                        });
                    }
                });
            });
            
            Debug.log(1, 'RiskDashboard', 'Processed traits count:', this.availableTraits.length);
            useAppStore.getState().setTraitsLoaded(true);
            
        } catch (error) {
            Debug.error('RiskDashboard', 'Failed to load traits:', error);
            grid.innerHTML = '<div class="loading">Failed to load traits</div>';
        }
    }

    async renderTraitCards(individualId) {
        Debug.log(1, 'RiskDashboard', 'renderTraitCards called with:', individualId);
        
        if (!this.geneticDb) {
            Debug.log(1, 'RiskDashboard', 'No geneticDb available');
            return;
        }
        
        const grid = this.shadowRoot.getElementById('traitsGrid');
        if (!grid) {
            Debug.log(1, 'RiskDashboard', 'No grid element found');
            return;
        }
        
        Debug.log(2, 'RiskDashboard', 'Grid element found, processing individualId');
        
        // Handle new event format with ready flag
        let actualIndividualId = individualId;
        let isReady = true;
        
        if (typeof individualId === 'object' && individualId !== null) {
            actualIndividualId = individualId.individualId;
            isReady = individualId.ready;
        }
        Debug.log(2, 'RiskDashboard', 'Processed individualId:', actualIndividualId, 'ready:', isReady);
        
        // Use provided individualId or get from uploader
        if (!actualIndividualId) {
            const uploader = document.querySelector('dna-uploader');
            actualIndividualId = uploader?.selectedIndividual || null;
            Debug.log(2, 'RiskDashboard', 'Got individualId from uploader:', actualIndividualId);
        }
        Debug.log(1, 'RiskDashboard', 'Final individualId:', actualIndividualId);
        
        // Don't show trait cards if no individual selected, not ready, or if importing
        const uploader = document.querySelector('dna-uploader');
        if (!actualIndividualId) {
            this.log('No individual selected, checking if any exist');
            // Check if there are any individuals at all
            const individuals = await this.geneticDb.getIndividuals();
            if (individuals.length === 0) {
                grid.innerHTML = '<div class="loading">Add an individual to start analyzing risk</div>';
            } else {
                grid.innerHTML = '<div class="loading">Select an individual to view trait analysis</div>';
            }
            return;
        }
        
        if (!isReady || uploader?.uploadState === 'importing') {
            this.log('Individual not ready or importing');
            // Check if we're in the add individual flow
            const uploadSection = uploader?.shadowRoot?.getElementById('uploadSection');
            if (uploadSection?.style.display === 'block') {
                grid.innerHTML = '<div class="loading">Import data to get started</div>';
            } else {
                grid.innerHTML = '<div class="loading">Individual data is loading...</div>';
            }
            return;
        }
        
        this.log('About to show loading cards');
        // Show loading cards immediately when individual is selected
        if (this.availableTraits.length > 0) {
            grid.innerHTML = '';
            for (const trait of this.availableTraits) {
                const card = document.createElement('div');
                card.className = 'trait-card loading-card';
                card.innerHTML = `
                    <div class="trait-header">
                        <h3 class="trait-name">${trait.name}</h3>
                        <span class="trait-category">${trait.category}</span>
                    </div>
                    <div class="trait-stats">
                        ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Loading...'} variants
                    </div>
                    <div class="risk-display">
                        <div class="loading">Loading...</div>
                    </div>
                `;
                grid.appendChild(card);
            }
        }
        this.log('Loading cards shown');
        
        Debug.log(2, 'RiskDashboard', 'About to replace with actual trait cards');
        // Group traits by family and render with family headers
        grid.innerHTML = '';
        
        Debug.log(1, 'RiskDashboard', 'Available traits count:', this.availableTraits.length);
        
        if (this.availableTraits.length === 0) {
            grid.innerHTML = '<div class="loading">No traits available</div>';
            return;
        }
        
        const familyGroups = {};
        this.availableTraits.forEach(trait => {
            if (!familyGroups[trait.family]) {
                familyGroups[trait.family] = [];
            }
            familyGroups[trait.family].push(trait);
        });
        
        for (const [familyKey, traits] of Object.entries(familyGroups)) {
            const family = this.traitCatalog.trait_families[familyKey];
            
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
                Debug.log(2, 'RiskDashboard', 'Getting cached risk for:', trait.id);
                const cacheStart = performance.now();
                const cached = await this.geneticDb.getCachedRisk(trait.id, actualIndividualId);
                const cacheTime = performance.now() - cacheStart;
                if (cached) {
                    let dataSize = 'unknown';
                    try {
                        dataSize = JSON.stringify(cached).length;
                    } catch (e) {
                        dataSize = 'too large to stringify';
                        Debug.log(1, 'RiskDashboard', 'MASSIVE cached data for:', trait.id, 'pgsDetails keys:', Object.keys(cached.pgsDetails || {}));
                    }
                    Debug.log(2, 'RiskDashboard', 'getCachedRisk time:', cacheTime, 'ms for', trait.id, 'size:', dataSize);
                } else {
                    Debug.log(2, 'RiskDashboard', 'getCachedRisk time:', cacheTime, 'ms for', trait.id, '(no cache)');
                }
                const card = this.createTraitCardSync(trait, actualIndividualId, cached);
                familyGrid.appendChild(card);
            }
            
            grid.appendChild(familyGrid);
        }
        
        this.log('All trait cards created');
    }

    createTraitCardSync(trait, individualId, cached) {
        this.log('Creating trait card for:', trait.name);
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
        
        this.log('Trait card created for:', trait.name);
        return card;
    }

    renderCachedResult(cached, individualId) {
        const level = cached.riskScore < 0.5 ? 'low' : cached.riskScore < 1.5 ? 'medium' : 'high';
        const levelText = cached.riskScore < 0.5 ? 'Lower Risk' : cached.riskScore < 1.5 ? 'Average Risk' : 'Higher Risk';
        
        return `
            <div class="risk-display">
                <div class="risk-score">${cached.riskScore.toFixed(2)}x</div>
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

    renderAnalyzeButton(traitId, individualId, duckdbReady) {
        const disabled = duckdbReady ? '' : 'disabled';
        const text = duckdbReady ? 'Calculate Risk' : 'Loading...';
        
        return `
            <div class="risk-display">
                <button class="analyze-btn" ${disabled} onclick="this.getRootNode().host.analyzeRisk('${traitId}', '${individualId}', this)">
                    <span>${text}</span>
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
                        const scorePrefix = netScore >= 0 ? '+' : '';
                        
                        return `
                            <div class="pgs-item" onclick="this.getRootNode().host.showPGSBreakdown('${pgsId}', '${individualId}', this)" style="cursor: pointer;">
                                <div class="pgs-header">
                                    <span class="pgs-name">${data.metadata?.name || pgsId}</span>
                                    <div class="pgs-score" style="color: ${scoreColor}">${scorePrefix}${netScore.toFixed(2)}x</div>
                                </div>
                                <div class="pgs-bar" title="View detailed calculation">
                                    <div class="pgs-negative" style="width: ${negPct}%" title="${data.negative} variants: ${data.negativeSum.toFixed(3)}x"></div>
                                    <div class="pgs-positive" style="width: ${posPct}%" title="${data.positive} variants: +${data.positiveSum.toFixed(3)}x"></div>
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
        const startTime = performance.now();
        
        // Get trait card from button element
        const card = buttonElement.closest('.trait-card');
        const traitId = card?.dataset.traitId;
        
        Debug.log(2, 'RiskDashboard', 'Fetching cached risk for:', traitId);
        const cached = traitId ? await this.geneticDb.getCachedRisk(traitId, individualId) : null;
        
        if (cached?.pgsBreakdown) {
            // Get PGS details from separate cache
            const pgsDetails = await this.geneticDb.getCachedPGSDetails(traitId, individualId);
            if (pgsDetails?.[pgsId]) {
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
                
                this.showPGSBreakdownInCard(pgsId, { ...cached, pgsDetails }, individualId, card);
            } else {
                alert('PGS details not available. Please recalculate the risk.');
            }
        } else {
            alert('PGS details not available. Please recalculate the risk.');
        }
    }
    
    showPGSBreakdownInCard(pgsId, cached, individualId, card) {
        Debug.log(1, 'RiskDashboard', 'showPGSBreakdownInCard start:', pgsId);
        const startTime = performance.now();
        
        const pgsBreakdown = card.querySelector('.pgs-breakdown');
        if (!pgsBreakdown) return;
        
        // Get trait metadata
        const traitId = card.dataset.traitId;
        const trait = this.availableTraits.find(t => t.id === traitId);
        const pgsMetadata = trait?.pgs_metadata?.[pgsId] || {};
        const metadata = { ...cached.pgsDetails[pgsId].metadata, ...pgsMetadata };
        
        Debug.log(2, 'RiskDashboard', 'Processing variants:', cached.pgsDetails[pgsId].totalVariants);
        const topVariants = cached.pgsDetails[pgsId].topVariants;
        
        // Calculate this PGS contribution to total trait score
        const pgsContribution = cached.pgsBreakdown[pgsId];
        const totalAbsMagnitude = Object.values(cached.pgsBreakdown).reduce((sum, pgs) => sum + Math.abs(pgs.positiveSum + pgs.negativeSum), 0);
        const pgsScore = pgsContribution.positiveSum + pgsContribution.negativeSum;
        const pgsPercentage = totalAbsMagnitude !== 0 ? Math.abs(pgsScore) / totalAbsMagnitude * 100 : 0;
        const pgsRiskMultiplier = Math.exp(pgsScore);
        
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
                    <div class="breakdown-content">
                    <div class="pgs-summary">
                        <p class="trait-desc">${metadata.trait || metadata.trait_reported || 'Polygenic Score'}</p>
                        <div class="calc-summary">
                            <div class="calc-item">Total variants: ${cached.pgsDetails[pgsId].totalVariants.toLocaleString()}</div>
                            <div class="calc-item">Contributing: ${pgsContribution.positive + pgsContribution.negative}</div>
                        </div>
                    </div>
                    
                    <canvas id="cardChart-${pgsId}" width="300" height="150"></canvas>
                    
                    <div class="calculation-info">
                        <h5>How Your Score is Calculated</h5>
                        <p>Your PGS score: ${pgsScore.toFixed(6)} → Risk multiplier: exp(${pgsScore.toFixed(6)}) = ${pgsRiskMultiplier.toFixed(2)}x</p>
                    </div>
                    
                    <div class="variant-breakdown">
                        <h5>Top Contributing Variants</h5>
                        <div class="variant-table">
                            <div class="table-header">
                                <span>Variant</span>
                                <span>Your DNA</span>
                                <span>Effect Allele</span>
                                <span>Effect Weight</span>
                            </div>
                            ${topVariants.map(variant => `
                                <div class="table-row">
                                    <span class="variant-id">${variant.rsid.startsWith('rs') ? `<a href="https://www.ncbi.nlm.nih.gov/snp/${variant.rsid}" target="_blank">${variant.rsid}</a>` : variant.rsid}</span>
                                    <span class="genotype">${variant.userGenotype || 'N/A'}</span>
                                    <span class="effect-allele">${variant.effect_allele}</span>
                                    <span class="effect-weight ${variant.effect_weight >= 0 ? 'positive' : 'negative'}">${variant.effect_weight >= 0 ? '+' : ''}${variant.effect_weight.toFixed(6)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
        `;
        
        pgsBreakdown.classList.add('showing-detail');
        
        Debug.log(1, 'RiskDashboard', 'showPGSBreakdownInCard total time:', performance.now() - startTime, 'ms');
        
        // Create chart
        setTimeout(() => {
            Debug.log(2, 'RiskDashboard', 'Creating chart for:', pgsId);
            this.createCardChart(pgsId, cached.pgsDetails[pgsId]);
        }, 100);
    }
    
    async showPGSList(traitId, individualId) {
        const card = this.shadowRoot.querySelector(`[data-trait-id="${traitId}"]`);
        const cached = await this.geneticDb.getCachedRisk(traitId, individualId);
        
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
        const cached = await this.geneticDb.getCachedRisk(this.currentPgsNavigation.traitId, individualId);
        const pgsDetails = await this.geneticDb.getCachedPGSDetails(this.currentPgsNavigation.traitId, individualId);
        
        if (cached && pgsDetails?.[pgsId]) {
            this.showPGSBreakdownInCard(pgsId, { ...cached, pgsDetails }, individualId, card);
        }
    }
    
    createCardChart(pgsId, cached) {
        const canvas = this.shadowRoot.getElementById(`cardChart-${pgsId}`);
        if (!canvas) return;
        
        // Load Chart.js only when needed
        window.loadChartJS().then(() => {
            const bins = cached.bins.filter(b => b.count > 0);
            const totalSum = bins.reduce((sum, b) => sum + b.sum, 0);
            
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: bins.map(b => b.label),
                    datasets: [{
                        label: 'Variants',
                        data: bins.map(b => b.count),
                        backgroundColor: 'rgba(0, 122, 204, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                afterLabel: (context) => {
                                    const bin = bins[context.dataIndex];
                                    const pct = totalSum > 0 ? (bin.sum / totalSum * 100).toFixed(1) : 0;
                                    return `${pct}% of score`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true },
                        x: { ticks: { maxRotation: 45 } }
                    }
                }
            });
        });
    }
    
    async getUserVariantsForPGS(individualId) {
        const transaction = this.geneticDb.db.transaction(['snps'], 'readonly');
        const store = transaction.objectStore('snps');
        const variants = [];
        
        await new Promise((resolve) => {
            const request = store.index('individualId').openCursor(individualId);
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    variants.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
        
        return variants;
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
                .risk-level { padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-top: 5px; }
                .low { background: #d4edda; color: #155724; }
                .medium { background: #fff3cd; color: #856404; }
                .high { background: #f8d7da; color: #721c24; }
                .trait-stats { font-size: 12px; color: #666; margin-top: 10px; }
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
                .loading-card .risk-display { opacity: 0.6; }
                .loading { color: #666; font-style: italic; }
                .error { color: #d32f2f; font-size: 12px; }
                .error-message { margin-top: 10px; padding: 8px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; }
                .error-text { font-size: 12px; color: #721c24; margin-bottom: 5px; }
                .retry-btn { font-size: 11px; padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; }
                .retry-btn:hover { background: #c82333; }
                .pgs-breakdown { margin-top: 15px; }
                .breakdown-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #333; }
                .pgs-list { max-height: 200px; overflow-y: auto; }
                .pgs-item { margin-bottom: 8px; }
                .pgs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
                .pgs-link { font-size: 11px; color: #007acc; text-decoration: none; }
                .pgs-link:hover { text-decoration: underline; }
                .pgs-bar { width: 100%; height: 16px; border: 1px solid #ddd; border-radius: 3px; overflow: hidden; }
                .pgs-negative { background: #d4edda; height: 100%; float: left; }
                .pgs-positive { background: #f8d7da; height: 100%; float: left; }
                .pgs-score { font-weight: bold; font-size: 11px; }
                .pgs-name { font-size: 11px; color: #007acc; font-weight: 500; }
                .pgs-item:hover { background: #f8f9fa; }
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
                .table-header { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; background: #f5f5f5; padding: 8px; font-weight: bold; font-size: 11px; }
                .table-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
                .variant-id a { color: #007acc; text-decoration: none; font-family: monospace; }
                .variant-id a:hover { text-decoration: underline; }
                .genotype { font-family: monospace; font-weight: bold; color: #2e7d32; }
                .effect-allele { font-family: monospace; color: #d32f2f; font-weight: bold; }
                .effect-weight { font-family: monospace; }
                .effect-weight.positive { color: #721c24; }
                .effect-weight.negative { color: #155724; }
                .pgs-link-section { margin-top: 15px; text-align: center; }
                .pgs-catalog-link { color: #007acc; text-decoration: none; font-size: 12px; }
                .pgs-catalog-link:hover { text-decoration: underline; }
            </style>
            <div id="traitsGrid" class="traits-container">
                <div class="loading">Loading traits...</div>
            </div>
        `;
    }

    async analyzeRisk(traitId, individualId, buttonElement) {
        const store = useAppStore.getState();
        
        // Wait for DuckDB if still loading
        if (!store.duckdbReady) {
            buttonElement.innerHTML = '<span>Finalizing analysis engine...</span>';
            // Wait for DuckDB to be ready
            while (!useAppStore.getState().duckdbReady) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (!this.duckdb || !this.geneticDb) {
            alert('Analysis engine not ready');
            return;
        }
        
        buttonElement.disabled = true;
        
        try {
            const trait = this.availableTraits.find(t => t.id === traitId);
            if (!trait || !trait.file_path) throw new Error('Trait file not found');
            
            // Check memory before starting
            MemoryMonitor.logMemoryUsage('Before risk calculation');
            const memoryPressure = MemoryMonitor.getMemoryPressureLevel();
            
            if (memoryPressure === 'critical') {
                throw new Error('Memory usage is too high. Please refresh the page and try again.');
            }
            
            if (memoryPressure === 'high') {
                // Show warning but allow calculation
                const warningDiv = document.createElement('div');
                warningDiv.className = 'memory-warning';
                warningDiv.innerHTML = `
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 12px; color: #856404;">
                        ⚠️ Memory usage is high. Calculation may be slower.
                    </div>
                `;
                buttonElement.closest('.trait-card').appendChild(warningDiv);
                setTimeout(() => warningDiv.remove(), 5000);
            }
            
            buttonElement.innerHTML = '<span>Loading trait data...</span>';
            buttonElement.classList.remove('progress');
            buttonElement.classList.add('loading');
            buttonElement.style.removeProperty('--progress');
            
            const { userDNA, totalVariants } = await this.getUserDNA(trait, individualId, (status, percent = 0) => {
                const span = buttonElement.querySelector('span');
                if (span) {
                    span.textContent = `${status} (${Math.round(percent)}%)`;
                } else {
                    buttonElement.textContent = `${status} (${Math.round(percent)}%)`;
                }
                buttonElement.style.setProperty('--progress', `${percent}%`);
            });
            
            const url = `/data/${trait.file_path}`;
            const result = await this.duckdb.calculateRisk(url, userDNA, (message, percent) => {
                const span = buttonElement.querySelector('span');
                if (span) {
                    span.textContent = `${message} (${Math.round(percent)}%)`;
                } else {
                    buttonElement.textContent = `${message} (${Math.round(percent)}%)`;
                }
                buttonElement.classList.remove('loading');
                buttonElement.classList.add('progress');
                buttonElement.style.setProperty('--progress', `${percent}%`);
            }, trait.pgs_metadata);
            
            buttonElement.textContent = 'Saving results...';
            // Cache the result without PGS details
            const riskData = {
                riskScore: result.riskScore,
                pgsBreakdown: result.pgsBreakdown,
                matchedVariants: userDNA.length,
                totalVariants: trait.variant_count,
                traitLastUpdated: trait.last_updated
            };
            
            Debug.log(2, 'RiskDashboard', 'Caching result:', traitId, individualId, riskData);
            await this.geneticDb.setCachedRisk(traitId, individualId, riskData);
            
            // Cache PGS details separately
            if (result.pgsDetails) {
                await this.geneticDb.setCachedPGSDetails(traitId, individualId, result.pgsDetails);
            }
            
            // Update the card
            const card = buttonElement.closest('.trait-card');
            card.innerHTML = `
                <div class="trait-header">
                    <h3 class="trait-name">${trait.name}</h3>
                    <span class="trait-category">${trait.category}</span>
                </div>
                <div class="trait-stats">
                    ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Unknown'} variants
                </div>
                ${this.renderCachedResult({
                    ...riskData,
                    calculatedAt: Date.now()
                }, individualId)}
            `;
            
            MemoryMonitor.logMemoryUsage('After risk calculation');
            
        } catch (error) {
            buttonElement.textContent = 'Error - Retry';
            buttonElement.disabled = false;
            
            // Show detailed error with retry option
            const card = buttonElement.closest('.trait-card');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            
            let errorMessage = error.message;
            if (error.message.includes('malloc') || error.message.includes('memory')) {
                errorMessage = 'Memory limit exceeded. Try refreshing the page or use a device with more RAM.';
            }
            
            errorDiv.innerHTML = `
                <div class="error-text">Calculation failed: ${errorMessage}</div>
                <button class="retry-btn" onclick="this.getRootNode().host.analyzeRisk('${traitId}', '${individualId}', this.parentElement.parentElement.querySelector('.analyze-btn'))">Retry</button>
            `;
            card.appendChild(errorDiv);
            
            this.error('Risk calculation failed:', error);
            MemoryMonitor.logMemoryUsage('After error');
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

    async getUserDNA(trait, individualId, statusCallback) {
        statusCallback?.('Loading user DNA into memory...', 10);
        
        // Load all user DNA into memory once
        const transaction = this.geneticDb.db.transaction(['snps'], 'readonly');
        const store = transaction.objectStore('snps');
        const userDNAMap = new Map();
        
        await new Promise((resolve) => {
            const request = store.index('individualId').openCursor(individualId);
            let loaded = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    loaded++;
                    const record = cursor.value;
                    // Store by both rsid and position
                    if (record.rsid) userDNAMap.set(record.rsid, record);
                    userDNAMap.set(`${record.chromosome}:${record.position}`, record);
                    cursor.continue();
                } else {
                    Debug.log(2, 'RiskDashboard', `Loaded ${loaded} DNA records into memory`);
                    resolve();
                }
            };
        });
        
        statusCallback?.('Loading trait data...', 30);
        
        // Load the unified trait file to see what variants we need
        const url = `/data/${trait.file_path}`;
        await this.duckdb.loadParquet(url, 'temp_trait');
        
        statusCallback?.('Matching variants...', 50);
        
        // Get all variants and match against in-memory DNA
        const variantResult = await this.duckdb.query(`
            SELECT 
                variant_id,
                chr_name,
                chr_position
            FROM temp_trait 
            WHERE variant_id IS NOT NULL OR (chr_name IS NOT NULL AND chr_position IS NOT NULL)
        `);
        
        const variants = variantResult.toArray();
        const matches = [];
        
        variants.forEach(v => {
            let match = null;
            if (v.variant_id && userDNAMap.has(v.variant_id)) {
                match = userDNAMap.get(v.variant_id);
            } else if (v.chr_name && v.chr_position) {
                const posKey = `${v.chr_name}:${v.chr_position}`;
                if (userDNAMap.has(posKey)) {
                    match = userDNAMap.get(posKey);
                }
            }
            if (match) matches.push(match);
        });
        
        await this.duckdb.query('DROP TABLE temp_trait');
        
        statusCallback?.('DNA matching complete', 90);
        Debug.log(2, 'RiskDashboard', 'getUserDNA completed:', matches.length, 'total matches found');
        
        return { userDNA: matches, totalVariants: variants.length };
    }

    async loadRisks() {
        // Refresh trait cards when DNA is imported
        if (this.availableTraits.length > 0) {
            this.renderTraitCards();
        }
    }

    // Called by parent app after geneticDb is set
    onReady() {
        if (this.availableTraits.length > 0) {
            this.renderTraitCards();
        }
    }

    createRiskCard(traitName, score) {
        // Legacy method - now handled by trait cards
        return document.createElement('div');
    }
}

customElements.define('risk-dashboard', RiskDashboard);