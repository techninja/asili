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
            this.updateTraitSelector();
        } catch (error) {
            console.error('Failed to load trait catalog:', error);
        }
    }

    updateTraitSelector() {
        const selector = this.shadowRoot.getElementById('traitSelector');
        if (!selector) return;
        
        selector.innerHTML = '<option value="">Select a trait to analyze...</option>';
        
        this.availableTraits.forEach(trait => {
            const option = document.createElement('option');
            option.value = trait.file;
            option.textContent = `${trait.name} (${trait.variant_count?.toLocaleString()} variants)`;
            selector.appendChild(option);
        });
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
                .risk-card {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 20px;
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .risk-score { font-size: 2em; font-weight: bold; color: #007acc; }
                .risk-level { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
                .low { background: #d4edda; color: #155724; }
                .medium { background: #fff3cd; color: #856404; }
                .high { background: #f8d7da; color: #721c24; }
                .loading { text-align: center; color: #666; }
                .trait-selector { margin: 20px 0; }
                select { padding: 8px; font-size: 14px; width: 100%; max-width: 400px; }
                button { padding: 8px 16px; margin-left: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                button:hover { background: #005a99; }
            </style>
            <div class="trait-selector">
                <select id="traitSelector">
                    <option value="">Loading traits...</option>
                </select>
                <button onclick="this.getRootNode().host.analyzeSelectedTrait()">Analyze Risk</button>
            </div>
            <div id="content">
                <div class="loading">Select a trait and upload your DNA file to see risk assessments</div>
            </div>
        `;
    }

    async analyzeSelectedTrait() {
        const selector = this.shadowRoot.getElementById('traitSelector');
        const selectedFile = selector.value;
        
        if (!selectedFile || !this.duckdb || !this.geneticDb) {
            alert('Please select a trait and upload your DNA file first');
            return;
        }
        
        const content = this.shadowRoot.getElementById('content');
        
        try {
            const trait = this.availableTraits.find(t => t.file === selectedFile);
            const url = `http://localhost:4343/data/${selectedFile}`;
            
            // Step 1: Load trait data
            content.innerHTML = '<div class="loading">Loading trait data...</div>';
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI update
            
            // Step 2: Get rsIDs from trait data
            content.innerHTML = '<div class="loading">Analyzing trait variants...</div>';
            const userDNA = await this.getUserDNAForTrait(url);
            
            // Step 3: Calculate risk
            content.innerHTML = `<div class="loading">Calculating risk from ${userDNA.length} matching variants...</div>`;
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI update
            
            const score = await this.duckdb.calculateRisk(url, userDNA);
            
            const card = this.createRiskCard(trait.name, score);
            content.innerHTML = '';
            content.appendChild(card);
        } catch (error) {
            content.innerHTML = `<div class="loading">Error calculating risk: ${error.message}</div>`;
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
        const individualId = uploader?.selectedIndividual || 'default';
        console.log(`[${new Date().toISOString()}] Using individual ID:`, individualId);
        
        // Get matching SNPs from IndexedDB by chromosome:position
        console.log(`[${new Date().toISOString()}] Searching IndexedDB for matches...`);
        const matches = await this.geneticDb.findByPositions(positionSet, individualId);
        console.log(`[${new Date().toISOString()}] Found`, matches.length, 'matches in user DNA');
        
        return matches;
    }
    async loadRisks() {
        // Legacy function - now using on-demand analysis
        const content = this.shadowRoot.getElementById('content');
        content.innerHTML = '<div class="loading">Select a trait above to analyze your risk</div>';
    }

    createRiskCard(traitName, score) {
        const card = document.createElement('div');
        card.className = 'risk-card';
        
        const level = score < 0.5 ? 'low' : score < 1.5 ? 'medium' : 'high';
        const levelText = score < 0.5 ? 'Lower Risk' : score < 1.5 ? 'Average Risk' : 'Higher Risk';
        
        card.innerHTML = `
            <h3>${traitName}</h3>
            <div class="risk-score">${score.toFixed(2)}x</div>
            <div class="risk-level ${level}">${levelText}</div>
            <p>Relative to population average</p>
        `;
        
        return card;
    }
}

customElements.define('risk-dashboard', RiskDashboard);