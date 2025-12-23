export class RiskDashboard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
        this.risks = {};
    }

    connectedCallback() {
        this.render();
        document.addEventListener('dna-imported', () => this.loadRisks());
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
            </style>
            <div id="content">
                <div class="loading">Upload your DNA file to see risk assessments</div>
            </div>
        `;
    }

    async loadRisks() {
        if (!this.duckdb) return;

        const content = this.shadowRoot.getElementById('content');
        content.innerHTML = '<div class="loading">Calculating risks...</div>';

        const traits = [
            { name: 'Alzheimer\'s Disease', file: 'Alzheimers_Risk_hg38.parquet' },
            { name: 'Type 2 Diabetes', file: 'Type_2_Diabetes_hg38.parquet' },
            { name: 'Coronary Artery Disease', file: 'Coronary_Artery_Disease_hg38.parquet' }
        ];

        const dashboard = document.createElement('div');
        dashboard.className = 'dashboard';

        for (const trait of traits) {
            try {
                const url = `http://localhost:4343/data/${trait.file}`;
                const score = await this.duckdb.calculateRisk(url);
                const card = this.createRiskCard(trait.name, score);
                dashboard.appendChild(card);
            } catch (error) {
                console.error(`Error calculating ${trait.name} risk:`, error);
            }
        }

        content.innerHTML = '';
        content.appendChild(dashboard);
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