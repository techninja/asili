import { DuckDBProvider } from './duckdb-provider.js';
import { GeneticDatabase } from './genetic-database.js';
import { DNAUploader } from './dna-uploader.js';
import { RiskDashboard } from './risk-dashboard.js';
import { useAppStore } from '../lib/store.js';

class AsiliApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
        this.geneticDb = null;
    }

    async connectedCallback() {
        this.renderLoading();
        this.initializeAsync();
    }

    renderLoading() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; font-family: system-ui; }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                header { text-align: center; margin-bottom: 40px; }
                .loading { text-align: center; padding: 40px; color: #666; }
            </style>
            <div class="container">
                <header>
                    <h1>Asili</h1>
                    <p>Your personal genomic risk assistant</p>
                </header>
                <div class="loading">Initializing...</div>
            </div>
        `;
    }

    async initializeAsync() {
        try {
            this.geneticDb = new GeneticDatabase();
            await this.geneticDb.init();
            
            this.renderWithUploader();
            
            // Start DuckDB loading in background
            setTimeout(() => this.initDuckDBBackground(), 100);
            
            this.render();
        } catch (error) {
            console.error('Init failed:', error);
        }
    }

    async initDuckDBBackground() {
        try {
            this.duckdb = new DuckDBProvider();
            await this.duckdb.init();
            
            // Update dashboard with duckdb reference
            const dashboard = this.shadowRoot.querySelector('risk-dashboard');
            if (dashboard) {
                dashboard.duckdb = this.duckdb;
            }
            
            useAppStore.getState().setDuckDBReady(true);
            console.log('DuckDB ready in background');
        } catch (error) {
            console.error('Background DuckDB init failed:', error);
        }
    }

    renderWithUploader() {
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
            </div>
        `;
        
        const uploader = this.shadowRoot.querySelector('dna-uploader');
        uploader.geneticDb = this.geneticDb;
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
        dashboard.geneticDb = this.geneticDb;
        dashboard.duckdb = this.duckdb;
        
        // Update dashboard when DuckDB becomes ready
        if (this.duckdb) {
            dashboard.duckdb = this.duckdb;
        }
    }
}

customElements.define('asili-app', AsiliApp);