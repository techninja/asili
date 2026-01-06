import { Debug } from '@asili/debug';
import { useAppStore } from '../lib/store.js';

export class ImportProgress extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Setup listeners after render
    setTimeout(() => this.setupEventListeners(), 0);
  }

  setupEventListeners() {
    const cancelBtn = this.shadowRoot.getElementById('cancelBtn');
    if (cancelBtn && !cancelBtn.hasAttribute('data-listener')) {
      cancelBtn.setAttribute('data-listener', 'true');
      cancelBtn.onclick = () => {
        Debug.log('ImportProgress', 'Cancel button clicked');
        useAppStore.getState().setCancelImport();
      };
    }
  }

  setProgress(percent, message) {
    const progressFill = this.shadowRoot.querySelector('.progress-fill');
    const progressPercent = this.shadowRoot.querySelector('.progress-percent');
    const statusText = this.shadowRoot.querySelector('.status-text');

    if (progressFill) {
      progressFill.style.strokeDasharray = `${(314 * percent) / 100} 314`;
    }
    if (progressPercent) {
      progressPercent.textContent = `${percent}%`;
    }
    if (statusText) {
      // Remove percentage from message
      const cleanMessage = message.replace(/\s*\(\d+%\)/, '');
      statusText.textContent = cleanMessage;
    }

    // Ensure cancel button has listener
    this.setupEventListeners();
  }

  render() {
    this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 12px;
                    padding: 30px;
                    margin: 20px 0;
                    text-align: center;
                }
                
                .progress-container {
                    position: relative;
                    display: inline-block;
                    margin-bottom: 20px;
                    width: 120px;
                    height: 120px;
                }
                
                .dna-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 32px;
                    animation: rotate 4s linear infinite, pulse 2s ease-in-out infinite;
                    z-index: 2;
                }
                
                .progress-ring {
                    position: absolute;
                    top: 0;
                    left: 0;
                }
                
                .progress-ring svg {
                    transform: rotate(-90deg);
                }
                
                .progress-bg {
                    fill: none;
                    stroke: #e9ecef;
                    stroke-width: 6;
                }
                
                .progress-fill {
                    fill: none;
                    stroke: #007acc;
                    stroke-width: 6;
                    stroke-linecap: round;
                    stroke-dasharray: 0 314;
                }
                
                .progress-percent {
                    position: absolute;
                    bottom: -35px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 16px;
                    font-weight: bold;
                    color: #007acc;
                }
                
                .status-text {
                    font-size: 14px;
                    color: #666;
                    font-style: italic;
                }
                
                .importing-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #dee2e6;
                }
                
                .importing-individual {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .importing-individual .emoji {
                    font-size: 20px;
                }
                
                .importing-individual .name {
                    font-size: 16px;
                    font-weight: 500;
                    color: #333;
                }
                
                .cancel-btn {
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .cancel-btn:hover {
                    background: #c82333;
                }
                
                @keyframes rotate {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.05); }
                }
            </style>
            
            <div class="importing-header">
                <div class="importing-individual">
                    <span class="emoji">${this.getAttribute('emoji') || '👤'}</span>
                    <span class="name">${this.getAttribute('name') || 'Individual'}</span>
                </div>
                <button class="cancel-btn" id="cancelBtn">×</button>
            </div>
            <div class="status-text">Starting import...</div>
            <div class="progress-container">
                <div class="dna-icon">🧬</div>
                <div class="progress-ring">
                    <svg width="120" height="120">
                        <circle cx="60" cy="60" r="50" class="progress-bg"/>
                        <circle cx="60" cy="60" r="50" class="progress-fill"/>
                    </svg>
                    <div class="progress-percent">0%</div>
                </div>
            </div>
        `;
  }
}

customElements.define('import-progress', ImportProgress);
