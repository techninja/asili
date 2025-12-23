import { DuckDBProvider } from './duckdb-provider.js';
import { DNAUploader } from './dna-uploader.js';
import { RiskDashboard } from './risk-dashboard.js';

class AsiliApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = new DuckDBProvider();
    }

    async connectedCallback() {
        await this.duckdb.init();
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
        
        uploader.duckdb = this.duckdb;
        dashboard.duckdb = this.duckdb;
    }
}

customElements.define('asili-app', AsiliApp);