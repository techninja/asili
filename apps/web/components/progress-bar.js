import { PROGRESS_STAGES } from '../../packages/core/src/index.js';

export class ProgressBar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.status = null;
    }

    static get observedAttributes() {
        return ['status'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'status' && newValue) {
            this.status = JSON.parse(newValue);
            this.render();
        }
    }

    setStatus(status) {
        this.status = status;
        this.render();
    }

    render() {
        if (!this.status) {
            this.shadowRoot.innerHTML = '';
            return;
        }

        const { stage, substage, progress, message } = this.status;
        const isError = stage === PROGRESS_STAGES.ERROR;
        const isComplete = stage === PROGRESS_STAGES.COMPLETE;
        
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    margin: 1rem 0;
                }

                .progress-container {
                    background: white;
                    border-radius: 8px;
                    padding: 1.5rem;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    text-align: center;
                }

                .progress-title {
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: ${isError ? '#dc3545' : '#111827'};
                    margin: 0 0 1rem 0;
                }

                .progress-bar {
                    width: 100%;
                    height: 1.5rem;
                    background-color: #e5e7eb;
                    border-radius: 0.75rem;
                    overflow: hidden;
                    margin-bottom: 0.75rem;
                }

                .progress-fill {
                    height: 100%;
                    background-color: ${isError ? '#dc3545' : isComplete ? '#28a745' : '#3b82f6'};
                    transition: width 0.3s ease;
                    border-radius: 0.75rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: ${progress}%;
                }

                .progress-text {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: white;
                }

                .progress-details {
                    font-size: 0.875rem;
                    color: #6b7280;
                    margin: 0;
                }

                .stage-info {
                    font-size: 0.75rem;
                    color: #9ca3af;
                    margin-bottom: 0.5rem;
                }
            </style>
            <div class="progress-container">
                <div class="stage-info">
                    ${this.formatStage(stage)}${substage ? ` → ${this.formatSubstage(substage)}` : ''}
                </div>
                <div class="progress-bar">
                    <div class="progress-fill">
                        <span class="progress-text">${Math.round(progress)}%</span>
                    </div>
                </div>
                <div class="progress-details">${message}</div>
            </div>
        `;
    }

    formatStage(stage) {
        const stageNames = {
            [PROGRESS_STAGES.IDLE]: 'Idle',
            [PROGRESS_STAGES.INITIALIZING]: 'Initializing',
            [PROGRESS_STAGES.LOADING_DATA]: 'Loading Data',
            [PROGRESS_STAGES.PROCESSING_DNA]: 'Processing DNA',
            [PROGRESS_STAGES.CALCULATING_PGS]: 'Calculating Risk Scores',
            [PROGRESS_STAGES.FINALIZING]: 'Finalizing',
            [PROGRESS_STAGES.COMPLETE]: 'Complete',
            [PROGRESS_STAGES.ERROR]: 'Error'
        };
        return stageNames[stage] || stage;
    }

    formatSubstage(substage) {
        return substage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

customElements.define('progress-bar', ProgressBar);