import { AsiliProcessor } from '../lib/asili-processor.js';
import { IndividualManager } from './individual-manager.js';
import { RiskDashboard } from './risk-dashboard.js';
import { ProgressBar } from './progress-bar.js';
import { useAppStore } from '../lib/store.js';
import { PROGRESS_STAGES } from '../../packages/core/src/index.js';

class AsiliApp extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.processor = null;
        this.progressUnsubscribe = null;
    }

    async connectedCallback() {
        this.render();
    }

    disconnectedCallback() {
        this.progressUnsubscribe?.();
        this.processor?.cleanup();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; font-family: system-ui; }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                header { text-align: center; margin-bottom: 40px; }
                .dashboard { margin-top: 2rem; }
            </style>
            <div class="container">
                <header>
                    <h1>Asili</h1>
                    <p>Your personal genomic risk assistant</p>
                </header>
                <individual-manager></individual-manager>
                <risk-dashboard class="dashboard"></risk-dashboard>
            </div>
        `;
    }
}

customElements.define('asili-app', AsiliApp);