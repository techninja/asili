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
            const response = await fetch('http://localhost:4343/data/trait_catalog.json');
            const catalog = await response.json();
            
            // Convert enhanced catalog to flat trait list
            this.availableTraits = [];
            Object.entries(catalog.trait_families).forEach(([familyKey, family]) => {
                Object.entries(family.subtypes).forEach(([subtypeKey, subtype]) => {
                    this.availableTraits.push({
                        id: `${familyKey}_${subtypeKey}`,
                        name: subtype.name,
                        description: subtype.description,
                        category: family.category,
                        file: `${familyKey}_${subtypeKey}_hg38.parquet`,
                        pgs_ids: subtype.pgs_ids,
                        variant_count: subtype.variant_count,
                        last_updated: subtype.last_updated
                    });
                });
                
                if (family.biomarkers) {
                    Object.entries(family.biomarkers).forEach(([biomarkerKey, biomarker]) => {
                        this.availableTraits.push({
                            id: `${familyKey}_${biomarkerKey}`,
                            name: biomarker.name,
                            description: biomarker.description || '',
                            category: family.category,
                            file: `${familyKey}_${biomarkerKey}_hg38.parquet`,
                            pgs_ids: biomarker.pgs_ids,
                            variant_count: biomarker.variant_count,
                            last_updated: biomarker.last_updated
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
        // Load cached risks for each trait
        grid.innerHTML = '';
        for (const trait of this.availableTraits) {
            const cached = await this.geneticDb.getCachedRisk(trait.file, actualIndividualId);
            const card = this.createTraitCardSync(trait, actualIndividualId, cached);
            grid.appendChild(card);
        }
        this.log('All trait cards created');
    }

    createTraitCardSync(trait, individualId, cached) {
        this.log('Creating trait card for:', trait.name);
        const card = document.createElement('div');
        card.className = 'trait-card';
        card.dataset.traitFile = trait.file;
        card.dataset.individualId = individualId;
        
        card.innerHTML = `
            <div class="trait-header">
                <h3 class="trait-name">${trait.name}</h3>
                <span class="trait-category">${trait.category}</span>
            </div>
            <div class="trait-stats">
                ${trait.pgs_ids?.length || 0} PGS scores | ${trait.variant_count?.toLocaleString() || 'Unknown'} variants
            </div>
            ${cached ? this.renderCachedResult(cached) : this.renderAnalyzeButton(trait, individualId)}
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
                ${cached.matchedVariants} matched variants<br>
                Calculated ${new Date(cached.calculatedAt).toLocaleDateString()}
            </div>
        `;
    }

    renderAnalyzeButton(trait, individualId) {
        return `
            <div class="risk-display">
                <button class="analyze-btn" onclick="this.getRootNode().host.analyzeRisk('${trait.file}', '${individualId}', this)">
                    Calculate Risk
                </button>
            </div>
        `;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .traits-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; margin-top: 20px; }
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
                .analyze-btn { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .analyze-btn:hover { background: #005a99; }
                .analyze-btn:disabled { background: #ccc; cursor: not-allowed; }
                .loading-card .risk-display { opacity: 0.6; }
                .loading { color: #666; font-style: italic; }
                .error { color: #d32f2f; font-size: 12px; }
            </style>
            <div id="traitsGrid" class="traits-grid">
                <div class="loading">Loading traits...</div>
            </div>
        `;
    }

    async analyzeRisk(traitFile, individualId, buttonElement) {
        if (!this.duckdb || !this.geneticDb) {
            alert('Please upload your DNA file first');
            return;
        }
        
        buttonElement.disabled = true;
        
        try {
            buttonElement.textContent = 'Loading trait data...';
            const url = `http://localhost:4343/data/${traitFile}`;
            const userDNA = await this.getUserDNAForTrait(url, individualId, (status) => {
                buttonElement.textContent = status;
            });
            
            buttonElement.textContent = 'Calculating risk score...';
            const riskScore = await this.duckdb.calculateRisk(url, userDNA);
            
            buttonElement.textContent = 'Saving results...';
            // Cache the result
            const riskData = {
                riskScore,
                matchedVariants: userDNA.length,
                traitLastUpdated: this.availableTraits.find(t => t.file === traitFile)?.last_updated
            };
            
            console.log('Caching result:', traitFile, individualId, riskData);
            await this.geneticDb.setCachedRisk(traitFile, individualId, riskData);
            
            // Update the card
            const card = buttonElement.closest('.trait-card');
            const riskDisplay = card.querySelector('.risk-display');
            riskDisplay.innerHTML = this.renderCachedResult({
                ...riskData,
                calculatedAt: Date.now()
            });
            
        } catch (error) {
            buttonElement.textContent = 'Error - Retry';
            buttonElement.disabled = false;
            this.error('Risk calculation failed:', error);
        }
    }
    
    recalculateRisk(buttonElement) {
        const card = buttonElement.closest('.trait-card');
        const traitFile = card.dataset.traitFile;
        const individualId = card.dataset.individualId;
        const trait = this.availableTraits.find(t => t.file === traitFile);
        
        if (trait && individualId) {
            // Replace cached result with analyze button
            const riskDisplay = card.querySelector('.risk-display');
            riskDisplay.innerHTML = this.renderAnalyzeButton(trait, individualId);
        }
    }

    async getUserDNAForTrait(traitUrl, individualId, statusCallback) {
        statusCallback?.('Loading trait data...');
        console.log(`[${new Date().toISOString()}] Loading trait data from:`, traitUrl);
        // Load trait data to get chr_name and chr_position values
        await this.duckdb.loadParquet(traitUrl, 'temp_trait');
        
        statusCallback?.('Querying positions...');
        console.log(`[${new Date().toISOString()}] Trait data loaded, querying positions...`);
        
        const positionsResult = await this.duckdb.query('SELECT DISTINCT chr_name, chr_position FROM temp_trait');
        const allPositions = positionsResult.toArray();
        console.log(`[${new Date().toISOString()}] Found`, allPositions.length, 'total positions');
        
        // Clean up temp table
        await this.duckdb.query('DROP TABLE IF EXISTS temp_trait');
        
        statusCallback?.('Creating position index...');
        // Create a Set of "chromosome:position" keys for fast lookup
        const positionSet = new Set(allPositions.map(row => `${row.chr_name}:${row.chr_position}`));
        console.log(`[${new Date().toISOString()}] Created position set with`, positionSet.size, 'unique positions');
        
        console.log(`[${new Date().toISOString()}] Using individual ID:`, individualId);
        
        // Debug: Check total SNP count for this individual
        const totalCount = await this.geneticDb.getCount(individualId);
        console.log(`[${new Date().toISOString()}] Total SNPs for individual ${individualId}:`, totalCount);
        
        statusCallback?.('Searching DNA matches...');
        // Get matching SNPs from IndexedDB by chromosome:position
        console.log(`[${new Date().toISOString()}] Searching IndexedDB for matches...`);
        const matches = await this.geneticDb.findByPositions(positionSet, individualId);
        console.log(`[${new Date().toISOString()}] Found`, matches.length, 'matches in user DNA');
        
        return matches;
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