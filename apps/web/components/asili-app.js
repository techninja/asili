import { DuckDBProvider } from './duckdb-provider.js';
import { GeneticDatabase } from './genetic-database.js';
import { DNAUploader } from './dna-uploader.js';
import { RiskDashboard } from './risk-dashboard.js';

class AsiliApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = new DuckDBProvider();
        this.geneticDb = new GeneticDatabase();
    }

    async connectedCallback() {
        await Promise.all([
            this.duckdb.init(),
            this.geneticDb.init()
        ]);
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; font-family: system-ui; }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                header { text-align: center; margin-bottom: 40px; }
            </style>
            <div class="container">
                <header>
                    <h1>Asili</h1>
                    <p>Your personal genomic risk assistant</p>
                </header>
                <dna-uploader></dna-uploader>
                <risk-dashboard></risk-dashboard>
            </div>
        `;
        
        const uploader = this.shadowRoot.querySelector('dna-uploader');
        const dashboard = this.shadowRoot.querySelector('risk-dashboard');
        
        uploader.geneticDb = this.geneticDb;
        dashboard.duckdb = this.duckdb;
        dashboard.geneticDb = this.geneticDb;
    }
}

customElements.define('asili-app', AsiliApp);