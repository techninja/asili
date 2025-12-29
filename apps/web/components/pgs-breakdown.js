import { Debug } from '../lib/debug.js';

export class PGSBreakdown extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.pgsData = null;
        this.userVariants = null;
        this.duckdb = null;
    }

    connectedCallback() {
        this.render();
    }

    async showBreakdown(pgsId, pgsData, userVariants, duckdb) {
        this.pgsData = pgsData;
        this.userVariants = userVariants;
        this.duckdb = duckdb;
        
        const modal = this.shadowRoot.getElementById('modal');
        modal.style.display = 'flex';
        
        await this.loadPGSDetails(pgsId);
    }

    async showBreakdownFromCache(pgsId, pgsDetails, userVariants) {
        const modal = this.shadowRoot.getElementById('modal');
        modal.style.display = 'flex';
        
        const content = this.shadowRoot.getElementById('modalContent');
        
        // Calculate detailed breakdown using cached data
        const breakdown = this.calculateDetailedBreakdown(pgsDetails.variants, userVariants);
        
        this.renderDetailedBreakdown(pgsId, pgsDetails.metadata, breakdown, pgsDetails.variants.length);
    }

    async loadPGSDetails(pgsId) {
        const content = this.shadowRoot.getElementById('modalContent');
        content.innerHTML = '<div class="error">Please recalculate risk to view breakdown</div>';
    }

    calculateDetailedBreakdown(pgsVariants, userVariants) {
        const userVariantMap = new Map();
        userVariants.forEach(v => {
            if (v.rsid) userVariantMap.set(v.rsid, v.allele1 + v.allele2);
        });

        const matched = [];
        const unmatched = [];
        let totalScore = 0;

        pgsVariants.forEach(pgsVar => {
            if (userVariantMap.has(pgsVar.rsid)) {
                const genotype = userVariantMap.get(pgsVar.rsid);
                if (genotype.includes(pgsVar.effect_allele)) {
                    matched.push({
                        ...pgsVar,
                        userGenotype: genotype,
                        hasEffectAllele: true
                    });
                    totalScore += pgsVar.effect_weight;
                } else {
                    matched.push({
                        ...pgsVar,
                        userGenotype: genotype,
                        hasEffectAllele: false
                    });
                }
            } else {
                unmatched.push(pgsVar);
            }
        });

        matched.sort((a, b) => {
            if (a.hasEffectAllele && !b.hasEffectAllele) return -1;
            if (!a.hasEffectAllele && b.hasEffectAllele) return 1;
            if (!a.hasEffectAllele && !b.hasEffectAllele) return 0;
            return Math.abs(b.effect_weight) - Math.abs(a.effect_weight);
        });

        return {
            matched: matched.filter(v => v.hasEffectAllele),
            unmatched,
            totalScore,
            matchRate: matched.length / pgsVariants.length,
            contributingVariants: matched.filter(v => v.hasEffectAllele).length
        };
    }

    renderDetailedBreakdown(pgsId, metadata, breakdown, totalVariants) {
        const content = this.shadowRoot.getElementById('modalContent');
        const riskMultiplier = Math.exp(breakdown.totalScore);
        
        content.innerHTML = `
            <div class="pgs-header">
                <h2>${metadata.name || metadata.pgs_name || pgsId}</h2>
                <p class="trait">${metadata.trait || metadata.trait_reported || 'Polygenic Score'}</p>
                <a href="https://www.pgscatalog.org/score/${pgsId}" target="_blank" class="pgs-link">
                    View on PGS Catalog →
                </a>
            </div>

            <div class="calculation-summary">
                <div class="calc-row">
                    <span class="label">Total PGS variants:</span>
                    <span class="value">${totalVariants.toLocaleString()}</span>
                </div>
                <div class="calc-row">
                    <span class="label">Your matched variants:</span>
                    <span class="value">${breakdown.matched.length.toLocaleString()} (${(breakdown.matchRate * 100).toFixed(1)}%)</span>
                </div>
                <div class="calc-row">
                    <span class="label">Contributing variants:</span>
                    <span class="value">${breakdown.contributingVariants.toLocaleString()}</span>
                </div>
                <div class="calc-row major">
                    <span class="label">Raw PGS score:</span>
                    <span class="value">${breakdown.totalScore.toFixed(6)}</span>
                </div>
                <div class="calc-row major">
                    <span class="label">Risk multiplier:</span>
                    <span class="value risk-score">exp(${breakdown.totalScore.toFixed(6)}) = ${riskMultiplier.toFixed(2)}x</span>
                </div>
            </div>

            <div class="score-distribution">
                <h3>Score Distribution</h3>
                <canvas id="distributionChart" width="400" height="200"></canvas>
            </div>

            <div class="variant-breakdown">
                <h3>Contributing Variants (showing top 20 by impact)</h3>
                <div class="variant-table">
                    <div class="table-header">
                        <span>Variant</span>
                        <span>Your Genotype</span>
                        <span>Effect Allele</span>
                        <span>Effect Weight</span>
                        <span>Contributes</span>
                    </div>
                    ${breakdown.matched.slice(0, 20).map(variant => `
                        <div class="table-row contributing">
                            <span class="variant-id"><a href="https://www.ncbi.nlm.nih.gov/snp/${variant.rsid}" target="_blank">${variant.rsid}</a></span>
                            <span class="genotype">${variant.userGenotype || 'N/A'}</span>
                            <span class="effect-allele">${variant.effect_allele}</span>
                            <span class="effect-weight">${variant.effect_weight.toFixed(6)}</span>
                            <span class="contributes">✓ +${variant.effect_weight.toFixed(6)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        setTimeout(() => this.createDistributionChart(breakdown.matched), 100);
    }

    createDistributionChart(variants) {
        const canvas = this.shadowRoot.getElementById('distributionChart');
        if (!canvas) return;
        
        const bins = [
            { label: '0.0001-0.001', min: 0.0001, max: 0.001, count: 0, sum: 0 },
            { label: '0.001-0.01', min: 0.001, max: 0.01, count: 0, sum: 0 },
            { label: '0.01-0.05', min: 0.01, max: 0.05, count: 0, sum: 0 },
            { label: '0.05-0.1', min: 0.05, max: 0.1, count: 0, sum: 0 },
            { label: '0.1-1.0', min: 0.1, max: 1.0, count: 0, sum: 0 },
            { label: '1.0+', min: 1.0, max: Infinity, count: 0, sum: 0 }
        ];
        
        variants.forEach(v => {
            const weight = Math.abs(v.effect_weight);
            const bin = bins.find(b => weight >= b.min && weight < b.max);
            if (bin) {
                bin.count++;
                bin.sum += v.effect_weight;
            }
        });
        
        const totalSum = bins.reduce((sum, b) => sum + b.sum, 0);
        
        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: bins.map(b => b.label),
                datasets: [{
                    label: 'Variant Count',
                    data: bins.map(b => b.count),
                    backgroundColor: 'rgba(0, 122, 204, 0.8)',
                    borderColor: 'rgba(0, 122, 204, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => {
                                const bin = bins[context.dataIndex];
                                const pct = totalSum > 0 ? (bin.sum / totalSum * 100).toFixed(1) : 0;
                                return `${pct}% of total score`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Variants' }
                    },
                    x: {
                        title: { display: true, text: 'Effect Weight Range' }
                    }
                }
            }
        });
    }

    close() {
        const modal = this.shadowRoot.getElementById('modal');
        modal.style.display = 'none';
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 1000;
                    align-items: center;
                    justify-content: center;
                }
                
                .modal-content {
                    background: white;
                    border-radius: 8px;
                    max-width: 90vw;
                    max-height: 90vh;
                    overflow-y: auto;
                    padding: 20px;
                    position: relative;
                }
                
                .close-btn {
                    position: absolute;
                    top: 10px;
                    right: 15px;
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                }
                
                .pgs-header {
                    border-bottom: 2px solid #eee;
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                
                .calculation-summary {
                    background: #f8f9fa;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                }
                
                .calc-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px 0;
                }
                
                .calc-row.major {
                    border-top: 1px solid #ddd;
                    padding-top: 10px;
                    font-weight: bold;
                }
                
                .score-distribution { 
                    margin: 20px 0; 
                }
                
                .variant-breakdown {
                    margin: 20px 0;
                }
                
                .variant-table {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .table-header {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
                    background: #f5f5f5;
                    padding: 10px;
                    font-weight: bold;
                    border-bottom: 1px solid #ddd;
                }
                
                .table-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
                    padding: 8px 10px;
                    border-bottom: 1px solid #eee;
                    font-size: 13px;
                }
                
                .table-row.contributing {
                    background: #fff3e0;
                }
                
                .variant-id {
                    font-family: monospace;
                    color: #007acc;
                }
                
                .variant-id a {
                    color: #007acc;
                    text-decoration: none;
                }
                
                .variant-id a:hover {
                    text-decoration: underline;
                }
                
                .genotype {
                    font-family: monospace;
                    font-weight: bold;
                }
                
                .effect-allele {
                    font-family: monospace;
                    color: #d32f2f;
                }
                
                .effect-weight {
                    font-family: monospace;
                }
                
                .contributes {
                    font-weight: bold;
                    color: #388e3c;
                }
            </style>
            
            <div id="modal" class="modal">
                <div class="modal-content">
                    <button class="close-btn" onclick="this.getRootNode().host.close()">&times;</button>
                    <div id="modalContent">
                        <div class="loading">Loading...</div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('pgs-breakdown', PGSBreakdown);