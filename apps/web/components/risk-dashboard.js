export class RiskDashboard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
        this.risks = {};
        this.availableTraits = [];
    }

    connectedCallback() {
        this.render();
        this.loadAvailableTraits();
        document.addEventListener('dna-imported', () => this.loadRisks());
    }

    async loadAvailableTraits() {
        try {
            const response = await fetch('http://localhost:4343/data/trait_catalog.json');
            const catalog = await response.json();
            this.availableTraits = catalog.traits;
            this.renderTraitCards();
        } catch (error) {
            console.error('Failed to load trait catalog:', error);
        }
    }

    async renderTraitCards() {
        if (!this.geneticDb) {
            return;
        }
        
        const grid = this.shadowRoot.getElementById('traitsGrid');
        const uploader = document.querySelector('dna-uploader');
        const individualId = uploader?.selectedIndividual || 'default';
        
        grid.innerHTML = '';
        
        for (const trait of this.availableTraits) {
            const card = await this.createTraitCard(trait, individualId);
            grid.appendChild(card);
        }
    }

    async createTraitCard(trait, individualId) {
        const card = document.createElement('div');
        card.className = 'trait-card';
        
        // Get the actual individual ID if not provided
        if (!individualId || individualId === 'default') {
            const individuals = await this.geneticDb.getIndividuals();
            individualId = individuals[0]?.id || 'default';
        }
        
        // Check for cached result
        console.log('Looking for cache:', trait.file, individualId);
        const cached = await this.geneticDb.getCachedRisk(trait.file, individualId);
        console.log('Found cached result:', cached);
        
        if (cached && trait.last_updated) {
            const cacheDate = new Date(cached.calculatedAt);
            const traitDate = new Date(trait.last_updated + 'Z'); // Force UTC parsing
            console.log('Cache date:', cacheDate, 'Trait updated:', traitDate);
            console.log('Trait is newer than cache:', traitDate > cacheDate);
        }
        
        const hasNewerResearch = cached && trait.last_updated && new Date(cached.calculatedAt) < new Date(trait.last_updated + 'Z');
        
        card.innerHTML = `
            <div class="trait-header">
                <h3 class="trait-name">${trait.name}</h3>
                <span class="trait-category">${trait.category}</span>
            </div>
            <div class="trait-stats">
                ${trait.variant_count?.toLocaleString()} variants
                ${hasNewerResearch ? '<br><span style="color: #007acc; font-size: 11px;">📊 New research available</span>' : ''}
            </div>
            ${cached ? this.renderCachedResult(cached) : this.renderAnalyzeButton(trait, individualId)}
        `;
        
        return card;
    }

    renderCachedResult(cached) {
        const level = cached.riskScore < 0.5 ? 'low' : cached.riskScore < 1.5 ? 'medium' : 'high';
        const levelText = cached.riskScore < 0.5 ? 'Lower Risk' : cached.riskScore < 1.5 ? 'Average Risk' : 'Higher Risk';
        
        return `
            <div class="risk-display">
                <div class="risk-score">${cached.riskScore.toFixed(2)}x</div>
                <div class="risk-level ${level}">${levelText}</div>
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
                .risk-display { text-align: center; margin: 15px 0; }
                .risk-score { font-size: 2em; font-weight: bold; color: #007acc; }
                .risk-level { padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-top: 5px; }
                .low { background: #d4edda; color: #155724; }
                .medium { background: #fff3cd; color: #856404; }
                .high { background: #f8d7da; color: #721c24; }
                .trait-stats { font-size: 12px; color: #666; margin-top: 10px; }
                .analyze-btn { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .analyze-btn:hover { background: #005a99; }
                .analyze-btn:disabled { background: #ccc; cursor: not-allowed; }
                .loading { color: #666; font-style: italic; }
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
        buttonElement.textContent = 'Calculating...';
        
        try {
            const url = `http://localhost:4343/data/${traitFile}`;
            const userDNA = await this.getUserDNAForTrait(url);
            const riskScore = await this.duckdb.calculateRisk(url, userDNA);
            
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
            console.error('Risk calculation failed:', error);
        }
    }
    
    async getUserDNAForTrait(traitUrl) {
        console.log(`[${new Date().toISOString()}] Loading trait data from:`, traitUrl);
        // Load trait data to get chr_name and chr_position values
        await this.duckdb.loadParquet(traitUrl, 'temp_trait');
        console.log(`[${new Date().toISOString()}] Trait data loaded, querying positions...`);
        
        const positionsResult = await this.duckdb.query('SELECT DISTINCT chr_name, chr_position FROM temp_trait');
        const allPositions = positionsResult.toArray();
        console.log(`[${new Date().toISOString()}] Found`, allPositions.length, 'total positions');
        
        // Clean up temp table
        await this.duckdb.query('DROP TABLE IF EXISTS temp_trait');
        
        // Create a Set of "chromosome:position" keys for fast lookup
        const positionSet = new Set(allPositions.map(row => `${row.chr_name}:${row.chr_position}`));
        console.log(`[${new Date().toISOString()}] Created position set with`, positionSet.size, 'unique positions');
        
        // Get selected individual ID from uploader
        const uploader = document.querySelector('dna-uploader');
        let individualId = uploader?.selectedIndividual;
        
        // If no individual selected, use the first available one
        if (!individualId) {
            const individuals = await this.geneticDb.getIndividuals();
            individualId = individuals[0]?.id || 'default';
        }
        
        console.log(`[${new Date().toISOString()}] Using individual ID:`, individualId);
        
        // Debug: Check total SNP count for this individual
        const totalCount = await this.geneticDb.getCount(individualId);
        console.log(`[${new Date().toISOString()}] Total SNPs for individual ${individualId}:`, totalCount);
        
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