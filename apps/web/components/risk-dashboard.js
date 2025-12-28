import { Debug } from '../lib/debug.js';

export class RiskDashboard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
        this.risks = {};
        this.availableTraits = [];
    }

    // Utility logging with timestamps
    log(...args) {
        Debug.log(1, 'RiskDashboard', ...args);
    }

    error(...args) {
        Debug.error('RiskDashboard', ...args);
    }

    connectedCallback() {
        this.render();
        this.loadAvailableTraits();
        document.addEventListener('dna-imported', () => this.loadRisks());
        document.addEventListener('individual-changed', (e) => {
            this.log('Individual changed event received:', e.detail);
            this.renderTraitCards(e.detail);
        });
    }

    async loadAvailableTraits() {
        const grid = this.shadowRoot.getElementById('traitsGrid');
        grid.innerHTML = '<div class="loading">Loading trait catalog...</div>';
        
        try {
            const manifestResponse = await fetch('http://localhost:4343/data/trait_manifest.json');
            const manifest = await manifestResponse.json();
            
            // Store catalog for family grouping
            this.traitCatalog = manifest;
            
            // Convert catalog to flat trait list with manifest data
            this.availableTraits = [];
            
            if (!manifest.trait_families) {
                throw new Error('Invalid manifest: missing trait_families');
            }
            
            Object.entries(manifest.trait_families).forEach(([familyKey, family]) => {
                if (family.subtypes) {
                    Object.entries(family.subtypes).forEach(([subtypeKey, subtype]) => {
                        const traitId = `${familyKey}_${subtypeKey}`;
                        const manifestData = manifest.traits?.[traitId] || {};
                        
                        this.availableTraits.push({
                            id: traitId,
                            name: subtype.name,
                            description: subtype.description,
                            category: family.category,
                            family: familyKey,
                            familyName: family.name,
                            file_path: manifestData.file_path,
                            pgs_ids: subtype.pgs_ids,
                            pgs_metadata: manifestData.pgs_metadata || {},
                            variant_count: manifestData.variant_count || 0,
                            last_updated: manifestData.last_updated
                        });
                    });
                }
                
                if (family.biomarkers) {
                    Object.entries(family.biomarkers).forEach(([biomarkerKey, biomarker]) => {
                        const traitId = `${familyKey}_${biomarkerKey}`;
                        const manifestData = manifest.traits?.[traitId] || {};
                        
                        this.availableTraits.push({
                            id: traitId,
                            name: biomarker.name,
                            description: biomarker.description || '',
                            category: family.category,
                            family: familyKey,
                            familyName: family.name,
                            file_path: manifestData.file_path,
                            pgs_ids: biomarker.pgs_ids,
                            pgs_metadata: manifestData.pgs_metadata || {},
                            variant_count: manifestData.variant_count || 0,
                            last_updated: manifestData.last_updated
                        });
                    });
                }
            });
            
            this.renderTraitCards();
        } catch (error) {
            this.error('Failed to load trait catalog:', error);
            grid.innerHTML = '<div class="loading">Failed to load traits</div>';
        }
    }

    async renderTraitCards(individualId) {
        this.log('renderTraitCards called with:', individualId);
        
        if (!this.geneticDb) {
            this.log('No geneticDb available, returning');
            return;
        }
        
        const grid = this.shadowRoot.getElementById('traitsGrid');
        this.log('Got grid element');
        
        // Handle new event format with ready flag
        let actualIndividualId = individualId;
        let isReady = true;
        
        if (typeof individualId === 'object' && individualId !== null) {
            actualIndividualId = individualId.individualId;
            isReady = individualId.ready;
        }
        this.log('Processed individualId:', actualIndividualId, 'ready:', isReady);
        
        // Use provided individualId or get from uploader
        if (!actualIndividualId) {
            const uploader = document.querySelector('dna-uploader');
            actualIndividualId = uploader?.selectedIndividual || null;
        }
        this.log('Final individualId:', actualIndividualId);
        
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
        
        this.log('About to replace with actual trait cards');
        // Group traits by family and render with family headers
        grid.innerHTML = '';
        
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
                const cached = await this.geneticDb.getCachedRisk(trait.id, actualIndividualId);
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
            ${cached ? this.renderCachedResult(cached) : this.renderAnalyzeButton(trait.id, individualId)}
        `;
        
        this.log('Trait card created for:', trait.name);
        return card;
    }

    renderCachedResult(cached) {
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
            ${cached.pgsBreakdown ? this.renderPgsBreakdown(cached.pgsBreakdown) : ''}
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

    renderPgsBreakdown(pgsBreakdown) {
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
                            <div class="pgs-item">
                                <div class="pgs-header">
                                    <a href="https://www.pgscatalog.org/score/${pgsId}" target="_blank" class="pgs-link" title="${data.metadata?.trait || ''}">
                                        ${data.metadata?.name || pgsId}
                                    </a>
                                    <div class="pgs-score" style="color: ${scoreColor}">${scorePrefix}${netScore.toFixed(2)}x</div>
                                </div>
                                <div class="pgs-bar">
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
            </style>
            <div id="traitsGrid" class="traits-container">
                <div class="loading">Loading traits...</div>
            </div>
        `;
    }

    async analyzeRisk(traitId, individualId, buttonElement) {
        if (!this.duckdb || !this.geneticDb) {
            alert('Please upload your DNA file first');
            return;
        }
        
        buttonElement.disabled = true;
        
        try {
            const trait = this.availableTraits.find(t => t.id === traitId);
            if (!trait || !trait.file_path) throw new Error('Trait file not found');
            
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
            
            const url = `http://localhost:4343/data/${trait.file_path}`;
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
            });
            
            buttonElement.textContent = 'Saving results...';
            // Cache the result
            const riskData = {
                riskScore: result.riskScore,
                pgsBreakdown: result.pgsBreakdown,
                matchedVariants: userDNA.length,
                totalVariants: trait.variant_count,
                traitLastUpdated: trait.last_updated
            };
            
            console.log('Caching result:', traitId, individualId, riskData);
            await this.geneticDb.setCachedRisk(traitId, individualId, riskData);
            
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
                })}
            `;
            
        } catch (error) {
            buttonElement.textContent = 'Error - Retry';
            buttonElement.disabled = false;
            
            // Show detailed error with retry option
            const card = buttonElement.closest('.trait-card');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = `
                <div class="error-text">Calculation failed: ${error.message}</div>
                <button class="retry-btn" onclick="this.getRootNode().host.analyzeRisk('${traitId}', '${individualId}', this.parentElement.parentElement.querySelector('.analyze-btn'))">Retry</button>
            `;
            card.appendChild(errorDiv);
            
            this.error('Risk calculation failed:', error);
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
        statusCallback?.('Loading trait data...', 10);
        
        // Load the unified trait file to see what variants we need
        const url = `http://localhost:4343/data/${trait.file_path}`;
        await this.duckdb.loadParquet(url, 'temp_trait');
        
        statusCallback?.('Analyzing variants...', 30);
        
        // Get all unique variant identifiers from the trait file
        const variantResult = await this.duckdb.query(`
            SELECT DISTINCT 
                variant_id,
                chr_name,
                chr_position
            FROM temp_trait 
            WHERE variant_id IS NOT NULL OR (chr_name IS NOT NULL AND chr_position IS NOT NULL)
        `);
        
        const variants = variantResult.toArray();
        const positions = new Set();
        const rsids = new Set();
        
        variants.forEach(v => {
            if (v.variant_id) rsids.add(v.variant_id);
            if (v.chr_name && v.chr_position) positions.add(`${v.chr_name}:${v.chr_position}`);
        });
        
        await this.duckdb.query('DROP TABLE temp_trait');
        
        statusCallback?.('Searching DNA matches...', 50);
        
        let matches = [];
        if (positions.size > 0) {
            const positionMatches = await this.geneticDb.findByPositions(positions, individualId);
            matches = matches.concat(positionMatches);
        }
        
        if (rsids.size > 0) {
            const rsidMatches = await this.geneticDb.findByRsids(Array.from(rsids), individualId);
            matches = matches.concat(rsidMatches);
        }
        
        statusCallback?.('DNA analysis complete', 100);
        
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