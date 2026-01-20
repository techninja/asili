import { HybridProcessor } from '../lib/hybrid-processor.js';
import { IndividualManager } from './individual-manager.js';
import { RiskDashboard } from './risk-dashboard.js';
import { ProgressBar } from './progress-bar.js';
import { QueueControl } from './queue-control.js';
import { useAppStore } from '../lib/store.js';

class AsiliApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.processor = null;
    this.progressUnsubscribe = null;
  }

  async connectedCallback() {
    this.render();

    // Initialize hybrid processor
    this.processor = new HybridProcessor();
    await this.processor.initialize();

    // Set processor on components immediately after initialization
    const riskDashboard = this.shadowRoot.querySelector('risk-dashboard');
    const queueControl = this.shadowRoot.querySelector('queue-control');
    const individualManager = this.shadowRoot.querySelector('individual-manager');

    if (riskDashboard) {
      riskDashboard.setProcessor(this.processor);
    }

    if (individualManager) {
      individualManager.setProcessor(this.processor);
    }

    if (queueControl) {
      const queueManager = this.processor.getQueueManager();
      if (queueManager) {
        queueControl.setQueueManager(queueManager);
        queueControl.setRiskDashboard(riskDashboard);
        queueControl.setProcessor(this.processor);
      }
    }

    // Subscribe to store changes to show/hide analysis section
    this.storeUnsubscribe = useAppStore.subscribe(state => {
      const analysisSection = this.shadowRoot.querySelector('.analysis-section');
      if (analysisSection) {
        analysisSection.style.display = state.selectedIndividual && state.individualReady ? 'block' : 'none';
      }
    });
  }

  disconnectedCallback() {
    this.progressUnsubscribe?.();
    this.storeUnsubscribe?.();
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
                <div class="analysis-section" style="display: none;">
                    <risk-dashboard class="dashboard"></risk-dashboard>
                    <queue-control></queue-control>
                </div>
            </div>
        `;
  }
}

customElements.define('asili-app', AsiliApp);
