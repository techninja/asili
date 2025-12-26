import { Debug } from '../lib/debug.js';
import { getFormatFromColumns } from '../lib/pgs-schema.js';

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
            
            // Store catalog for family grouping
            this.traitCatalog = catalog;
            
            // Convert enhanced catalog to flat trait list
            this.availableTraits = [];
            Object.entries(catalog.trait_families).forEach(([familyKey, family]) => {
                Object.entries(family.subtypes).forEach(([subtypeKey, subtype]) => {
                    // Collect PGS metadata from all formats
                    const pgsMetadata = {};
                    Object.values(subtype.formats || {}).forEach(format => {
                        Object.assign(pgsMetadata, format.pgs_metadata || {});
                    });
                    
                    this.availableTraits.push({
                        id: `${familyKey}_${subtypeKey}`,
                        name: subtype.name,
                        description: subtype.description,
                        category: family.category,
                        family: familyKey,
                        familyName: family.name,
                        formats: subtype.formats || {},
                        pgs_ids: subtype.pgs_ids,
                        pgs_metadata: pgsMetadata,
                        variant_count: subtype.variant_count,
                        last_updated: subtype.last_updated
                    });
                });
                
                if (family.biomarkers) {
                    Object.entries(family.biomarkers).forEach(([biomarkerKey, biomarker]) => {
                        // Collect PGS metadata from all formats
                        const pgsMetadata = {};
                        Object.values(biomarker.formats || {}).forEach(format => {
                            Object.assign(pgsMetadata, format.pgs_metadata || {});
                        });
                        
                        this.availableTraits.push({
                            id: `${familyKey}_${biomarkerKey}`,
                            name: biomarker.name,
                            description: biomarker.description || '',
                            category: family.category,
                            family: familyKey,
                            familyName: family.name,
                            formats: biomarker.formats || {},
                            pgs_ids: biomarker.pgs_ids,
                            pgs_metadata: pgsMetadata,
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
                    Calculate Risk
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
                .analyze-btn { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .analyze-btn:hover { background: #005a99; }
                .analyze-btn:disabled { background: #ccc; cursor: not-allowed; }
                .loading-card .risk-display { opacity: 0.6; }
                .loading { color: #666; font-style: italic; }
                .error { color: #d32f2f; font-size: 12px; }
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
            if (!trait) throw new Error('Trait not found');
            
            buttonElement.textContent = 'Loading trait data...';
            const { userDNA, totalVariants } = await this.getUserDNAForMultipleFormats(trait, individualId, (status) => {
                buttonElement.textContent = status;
            });
            
            buttonElement.textContent = 'Calculating risk score...';
            const result = await this.calculateCombinedRisk(trait, userDNA);
            
            buttonElement.textContent = 'Saving results...';
            // Cache the result
            const riskData = {
                riskScore: result.riskScore,
                pgsBreakdown: result.pgsBreakdown,
                matchedVariants: userDNA.length,
                totalVariants,
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

    async getUserDNAForMultipleFormats(trait, individualId, statusCallback) {
        const allPositions = new Set();
        const allRsids = new Set();
        let totalVariants = 0;
        
        // Load all format files and collect positions/rsids
        for (const [formatKey, formatData] of Object.entries(trait.formats)) {
            statusCallback?.(`Loading ${formatData.format_name} data...`);
            const url = `http://localhost:4343/data/${formatData.file_path}`;
            console.log(`[${new Date().toISOString()}] Loading format data from:`, url);
            
            await this.duckdb.loadParquet(url, `temp_${formatKey.toLowerCase()}`);
            totalVariants += formatData.variant_count;
            
            // Check what columns exist and detect format
            const columnsResult = await this.duckdb.query(`PRAGMA table_info(temp_${formatKey.toLowerCase()})`);
            const columns = columnsResult.toArray().map(row => row.name);
            const formatInfo = getFormatFromColumns(columns);
            
            if (formatInfo?.format.matchingStrategy === 'position') {
                // Standard SNP format - use positions
                const positionsResult = await this.duckdb.query(`SELECT DISTINCT chr_name, chr_position FROM temp_${formatKey.toLowerCase()}`);
                positionsResult.toArray().forEach(row => {
                    allPositions.add(`${row.chr_name}:${row.chr_position}`);
                });
            } else if (formatInfo?.format.matchingStrategy === 'rsid') {
                // rsID format - collect rsids
                const rsidsResult = await this.duckdb.query(`SELECT DISTINCT rsid FROM temp_${formatKey.toLowerCase()}`);
                rsidsResult.toArray().forEach(row => {
                    allRsids.add(row.rsid);
                });
            } else if (formatInfo?.format.matchingStrategy === 'variant_id') {
                // HLA format - collect variant IDs as rsids
                const variantResult = await this.duckdb.query(`SELECT DISTINCT variant_id FROM temp_${formatKey.toLowerCase()}`);
                variantResult.toArray().forEach(row => {
                    allRsids.add(row.variant_id);
                });
            }
            
            // Clean up temp table
            await this.duckdb.query(`DROP TABLE IF EXISTS temp_${formatKey.toLowerCase()}`);
        }
        
        console.log(`[${new Date().toISOString()}] Collected`, allPositions.size, 'positions and', allRsids.size, 'rsids');
        
        statusCallback?.('Searching DNA matches...');
        let matches = [];
        
        // Get matches by positions if we have any
        if (allPositions.size > 0) {
            const positionMatches = await this.geneticDb.findByPositions(allPositions, individualId);
            matches = matches.concat(positionMatches);
        }
        
        // Get matches by rsids if we have any
        if (allRsids.size > 0) {
            const rsidMatches = await this.geneticDb.findByRsids(Array.from(allRsids), individualId);
            matches = matches.concat(rsidMatches);
        }
        
        console.log(`[${new Date().toISOString()}] Found`, matches.length, 'total matches in user DNA');
        
        return { userDNA: matches, totalVariants };
    }
    
    async calculateCombinedRisk(trait, userDNA) {
        let totalScore = 0;
        let totalWeight = 0;
        let combinedBreakdown = {};
        
        // Calculate risk for each format separately and combine
        for (const [formatKey, formatData] of Object.entries(trait.formats)) {
            const url = `http://localhost:4343/data/${formatData.file_path}`;
            const result = await this.duckdb.calculateRisk(url, userDNA);
            
            // Weight by number of variants in this format
            const weight = formatData.variant_count || 1;
            totalScore += result.riskScore * weight;
            totalWeight += weight;
            
            // Merge PGS breakdowns with metadata
            for (const [pgsId, breakdown] of Object.entries(result.pgsBreakdown)) {
                combinedBreakdown[pgsId] = {
                    ...breakdown,
                    metadata: trait.pgs_metadata?.[pgsId] || { name: pgsId }
                };
            }
        }
        
        return {
            riskScore: totalWeight > 0 ? totalScore / totalWeight : 0,
            pgsBreakdown: combinedBreakdown
        };
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