import { Debug } from '@asili/debug';
import { useAppStore } from '../lib/store.js';
import './import-progress.js';

const DEFAULT_EMOJIS = ['👤', '👨', '👩', '🧑', '👶', '👴', '👵', '🧔', '👱', '🦱', '🦳', '🦲'];

export class IndividualManager extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.processor = null;
        this.unsubscribe = null;
        this.selectedFile = null;
        this.showingUpload = false;
        this.importAborted = false;
    }

    async connectedCallback() {
        this.render();
        this.setupEventListeners();
        
        // Subscribe to state changes
        this.unsubscribe = useAppStore.subscribe((state) => {
            this.updateUI(state);
        });
        
        // Initialize processor and load individuals
        await this.initializeProcessor();
        setTimeout(() => this.loadIndividuals(), 100);
    }

    async initializeProcessor() {
        try {
            const { AsiliProcessor } = await import('../lib/asili-processor.js');
            this.processor = new AsiliProcessor();
            await this.processor.initialize();
            Debug.log('IndividualManager', 'Processor initialized');
        } catch (error) {
            Debug.error('IndividualManager', 'Failed to initialize processor:', error);
        }
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.processor?.cleanup();
    }

    async loadIndividuals() {
        if (!this.processor?.storage) return;
        
        try {
            const individuals = await this.processor.storage.getIndividuals();
            const store = useAppStore.getState();
            
            store.setIndividuals(individuals);
            
            // Auto-select first complete individual if none selected and we have individuals
            const completeIndividuals = individuals.filter(ind => ind.status === 'complete');
            if (completeIndividuals.length > 0 && !store.selectedIndividual && store.uploadState === 'idle') {
                store.setSelectedIndividual(completeIndividuals[0].id);
            }
        } catch (error) {
            Debug.error('IndividualManager', 'Failed to load individuals:', error);
        }
    }

    updateUI(state) {
        const container = this.shadowRoot.getElementById('container');
        if (!container) return;

        if (state.individuals.length === 0) {
            this.renderNoDataState(state);
        } else if (state.individuals.length === 1) {
            this.renderSingleUserState(state);
        } else {
            this.renderMultipleUsersState(state);
        }
        
        // Update progress if importing or deleting
        if ((state.uploadState === 'importing' || state.uploadState === 'deleting') && state.uploadProgress) {
            const progressEl = this.shadowRoot.getElementById(state.uploadState === 'importing' ? 'importProgress' : 'deleteProgress');
            if (progressEl) {
                const progressMatch = state.uploadProgress.match(/(\d+)%/);
                const percent = progressMatch ? parseInt(progressMatch[1]) : 0;
                // Only invert progress for deletion (start at 100%, go down to 0%)
                const displayPercent = state.uploadState === 'deleting' ? 100 - percent : percent;
                progressEl.setProgress(displayPercent, state.uploadProgress);
            }
        }
        
        // Handle cancel import
        if (state.cancelImport) {
            this.cancelImport();
        }
    }

    renderNoDataState(state) {
        const container = this.shadowRoot.getElementById('container');
        
        if (state.uploadState === 'importing') {
            container.innerHTML = `<import-progress id="importProgress" name="${state.importingIndividual?.name || ''}" emoji="${state.importingIndividual?.emoji || '👤'}"></import-progress>`;
        } else if (state.uploadState === 'deleting') {
            container.innerHTML = `<import-progress id="deleteProgress" name="Deleting ${state.importingIndividual?.name || 'Individual'}" emoji=""></import-progress>`;
        } else if (this.showingUpload) {
            container.innerHTML = this.renderUploadComponent();
            this.setupUploadListeners();
        } else {
            container.innerHTML = `
                <div class="no-data-state">
                    <div class="welcome-message">
                        <h3>Welcome to Asili</h3>
                        <p>Import your DNA data to get started with personalized genomic risk analysis</p>
                    </div>
                    <button class="primary-btn" id="importBtn">
                        📁 Import DNA Data
                    </button>
                </div>
            `;
            
            this.shadowRoot.getElementById('importBtn').onclick = () => this.startImport();
        }
    }

    renderSingleUserState(state) {
        const individual = state.individuals[0];
        const container = this.shadowRoot.getElementById('container');
        
        if (state.uploadState === 'importing') {
            container.innerHTML = `<import-progress id="importProgress" name="${state.importingIndividual?.name || ''}" emoji="${state.importingIndividual?.emoji || '👤'}"></import-progress>`;
        } else if (state.uploadState === 'deleting') {
            container.innerHTML = `<import-progress id="deleteProgress" name="Deleting Data" emoji="🗑️"></import-progress>`;
        } else if (this.showingUpload) {
            container.innerHTML = `
                <div class="single-user-state">
                    <div class="individual-display">
                        <span class="emoji">${individual.emoji || '👤'}</span>
                        <span class="name">${individual.name}</span>
                        <button class="edit-btn" id="editBtn">✏️</button>
                    </div>
                    ${this.renderUploadComponent()}
                </div>
            `;
            this.shadowRoot.getElementById('editBtn').onclick = () => this.editIndividual(individual);
            this.setupUploadListeners();
        } else {
            container.innerHTML = `
                <div class="single-user-state">
                    <div class="individual-display">
                        <span class="emoji" id="userEmoji">${individual.emoji || '👤'}</span>
                        <span class="name ${individual.status !== 'complete' ? 'failed' : ''}" id="userName">${individual.name}${individual.status !== 'complete' ? ' (Failed Import)' : ''}</span>
                        <button class="edit-btn" id="editBtn">✏️</button>
                    </div>
                    <div class="actions">
                        <button class="secondary-btn" id="addBtn">+ Add Another</button>
                        <button class="danger-btn" id="removeBtn">🗑️ Remove</button>
                    </div>
                </div>
            `;
            
            this.shadowRoot.getElementById('editBtn').onclick = () => this.editIndividual(individual);
            this.shadowRoot.getElementById('addBtn').onclick = () => this.startImport();
            this.shadowRoot.getElementById('removeBtn').onclick = () => this.removeIndividual(individual.id);
        }
    }

    renderMultipleUsersState(state) {
        const container = this.shadowRoot.getElementById('container');
        
        if (state.uploadState === 'importing') {
            container.innerHTML = `<import-progress id="importProgress" name="${state.importingIndividual?.name || ''}" emoji="${state.importingIndividual?.emoji || '👤'}"></import-progress>`;
        } else if (state.uploadState === 'deleting') {
            container.innerHTML = `<import-progress id="deleteProgress" name="Deleting Data" emoji="🗑️"></import-progress>`;
        } else if (this.showingUpload) {
        } else if (this.showingUpload) {
            container.innerHTML = `
                <div class="multiple-users-state">
                    <div class="selector-row">
                        <select id="individualSelect">
                            ${state.individuals.map(ind => 
                                `<option value="${ind.id}" ${ind.id === state.selectedIndividual ? 'selected' : ''}>
                                    ${ind.emoji || '👤'} ${ind.name}
                                </option>`
                            ).join('')}
                        </select>
                        <button class="edit-btn" id="editBtn">✏️</button>
                    </div>
                    ${this.renderUploadComponent()}
                </div>
            `;
            
            const select = this.shadowRoot.getElementById('individualSelect');
            select.onchange = (e) => useAppStore.getState().setSelectedIndividual(e.target.value);
            
            this.shadowRoot.getElementById('editBtn').onclick = () => {
                const selected = state.individuals.find(i => i.id === state.selectedIndividual);
                if (selected) this.editIndividual(selected);
            };
            this.setupUploadListeners();
        } else {
            container.innerHTML = `
                <div class="multiple-users-state">
                    <div class="selector-row">
                        <select id="individualSelect">
                            ${state.individuals.map(ind => {
                                const status = ind.status === 'complete' ? '' : ' (Failed Import)';
                                const disabled = ind.status !== 'complete' ? 'disabled' : '';
                                return `<option value="${ind.id}" ${ind.id === state.selectedIndividual ? 'selected' : ''} ${disabled}>
                                    ${ind.emoji || '👤'} ${ind.name}${status}
                                </option>`;
                            }).join('')}
                        </select>
                        <button class="edit-btn" id="editBtn">✏️</button>
                    </div>
                    <div class="actions">
                        <button class="secondary-btn" id="addBtn">+ Add Individual</button>
                        <button class="danger-btn" id="removeBtn">🗑️ Remove Current</button>
                    </div>
                </div>
            `;
            
            const select = this.shadowRoot.getElementById('individualSelect');
            select.onchange = (e) => useAppStore.getState().setSelectedIndividual(e.target.value);
            
            this.shadowRoot.getElementById('editBtn').onclick = () => {
                const selected = state.individuals.find(i => i.id === state.selectedIndividual);
                if (selected) this.editIndividual(selected);
            };
            this.shadowRoot.getElementById('addBtn').onclick = () => this.startImport();
            this.shadowRoot.getElementById('removeBtn').onclick = () => {
                if (state.selectedIndividual) this.removeIndividual(state.selectedIndividual);
            };
        }
    }

    renderUploadComponent() {
        const fileName = this.selectedFile ? this.selectedFile.name : '';
        const fileSize = this.selectedFile ? (this.selectedFile.size / 1024 / 1024).toFixed(1) : '';
        const defaultName = fileName.replace(/\.[^/.]+$/, "");
        
        return `
            <div class="upload-component">
                <div class="file-info">Selected: ${fileName} (${fileSize} MB)</div>
                <div class="upload-form">
                    <div class="form-row">
                        <input type="text" id="nameInput" placeholder="Individual name" value="${defaultName}" />
                        <div class="emoji-selector">
                            ${DEFAULT_EMOJIS.map((emoji, i) => 
                                `<button class="emoji-btn ${i === 0 ? 'selected' : ''}" data-emoji="${emoji}">${emoji}</button>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="secondary-btn" id="cancelBtn">Cancel</button>
                        <button class="primary-btn" id="importBtn">Import</button>
                    </div>
                </div>
            </div>
        `;
    }

    startImport() {
        this.showingUpload = true;
        this.shadowRoot.getElementById('fileInput').click();
    }

    setupEventListeners() {
        const fileInput = this.shadowRoot.getElementById('fileInput');
        
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.selectedFile = file;
                // Force re-render to show upload component
                this.updateUI(useAppStore.getState());
            }
        };
    }

    setupUploadListeners() {
        const nameInput = this.shadowRoot.getElementById('nameInput');
        const importBtn = this.shadowRoot.getElementById('importBtn');
        const cancelBtn = this.shadowRoot.getElementById('cancelBtn');
        const emojiButtons = this.shadowRoot.querySelectorAll('.emoji-btn');
        
        emojiButtons.forEach(btn => {
            btn.onclick = () => {
                emojiButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        });
        
        if (nameInput) {
            nameInput.onkeydown = (e) => {
                if (e.key === 'Enter') this.importIndividual();
            };
        }
        
        if (importBtn) {
            importBtn.onclick = () => this.importIndividual();
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.showingUpload = false;
                this.selectedFile = null;
                this.shadowRoot.getElementById('fileInput').value = '';
                this.updateUI(useAppStore.getState());
            };
        }
    }

    editIndividual(individual) {
        // For now, just show an alert - we can implement inline editing later
        const newName = prompt('Enter new name:', individual.name);
        if (newName && newName.trim() && newName.trim() !== individual.name) {
            this.updateIndividualName(individual.id, newName.trim());
        }
    }

    async updateIndividualName(individualId, newName) {
        try {
            await this.processor.storage.updateIndividual(individualId, { name: newName });
            await this.loadIndividuals();
        } catch (error) {
            Debug.error('IndividualManager', 'Failed to update individual:', error);
            alert('Failed to update individual name');
        }
    }

    async removeIndividual(individualId) {
        if (!confirm('Remove all data for this individual? This cannot be undone.')) {
            // User cancelled the confirm dialog, reset any flags
            const store = useAppStore.getState();
            store.cancelImport = false;
            this.importAborted = false;
            return;
        }
        
        const store = useAppStore.getState();
        store.setUploadState('deleting', 'Starting deletion...');
        
        try {
            // Mark individual as not ready during deletion
            await this.processor.storage.updateIndividual(individualId, { status: 'deleting' });
            
            await this.processor.clearCachedResults(individualId);
            
            // Get individual info for progress display
            const individual = store.individuals.find(ind => ind.id === individualId);
            const individualName = individual ? `${individual.emoji || '👤'} ${individual.name}` : 'Individual';
            
            await this.processor.storage.deleteIndividual(individualId, (message, percent) => {
                store.setUploadState('deleting', message, { name: individualName, emoji: '' });
            });
            
            // Update state
            if (store.selectedIndividual === individualId) {
                store.setSelectedIndividual(null);
            }
            store.setUploadState('idle');
            await this.loadIndividuals();
            
        } catch (error) {
            Debug.error('IndividualManager', 'Failed to remove individual:', error);
            store.setUploadState('idle');
            alert('Failed to remove individual');
        }
    }

    async importIndividual() {
        const nameInput = this.shadowRoot.getElementById('nameInput');
        const selectedEmoji = this.shadowRoot.querySelector('.emoji-btn.selected');
        const progressText = this.shadowRoot.getElementById('progressText');
        
        const name = nameInput?.value.trim();
        const emoji = selectedEmoji?.dataset.emoji || '👤';
        
        if (!name) {
            alert('Please enter a name');
            return;
        }
        
        if (!this.selectedFile) {
            alert('Please select a file');
            return;
        }
        
        const store = useAppStore.getState();
        const individualId = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
        
        // Set individual as selected but not ready
        store.setSelectedIndividual(individualId, false);
        store.setUploadState('importing', 'Starting import...', { name, emoji });
        
        // Hide upload form and show progress
        this.showingUpload = false;
        this.updateUI(store);
        
        try {
            this.importAborted = false;
            const result = await this.processor.importDNA(this.selectedFile, individualId, name, emoji, (message, percent) => {
                if (this.importAborted) {
                    throw new Error('Import cancelled by user');
                }
                const store = useAppStore.getState();
                store.setUploadState('importing', `${message} (${Math.round(percent)}%)`, { name, emoji });
            });
            
            // Clean up
            this.selectedFile = null;
            this.shadowRoot.getElementById('fileInput').value = '';
            
            // Mark individual as complete first
            await this.processor.storage.updateIndividual(individualId, { status: 'complete' });
            // Then update store
            await this.loadIndividuals();
            store.setSelectedIndividual(individualId, true);
            store.setUploadState('idle');
            
            Debug.log('IndividualManager', 'Import completed successfully', result);
            
        } catch (error) {
            Debug.error('IndividualManager', 'Import error:', error);
            
            if (error.message === 'Import cancelled by user') {
                // Import was cancelled, clean up silently
                Debug.log('IndividualManager', 'Import cancelled by user');
            } else {
                // Actual error occurred
                store.setUploadState('idle');
                
                // Remove the failed individual
                store.setSelectedIndividual(null);
                setTimeout(() => this.updateUI(store), 3000);
            }
        }
    }

    cancelImport() {
        Debug.log('IndividualManager', 'Cancel import called');
        const store = useAppStore.getState();
        const individualId = store.selectedIndividual;
        
        // Set abort flag to stop import process
        this.importAborted = true;
        
        // Reset cancel flag
        store.cancelImport = false;
        
        if (individualId) {
            // Clean up any partial data for the cancelled individual
            this.removeIndividual(individualId);
        } else {
            store.setUploadState('idle');
            store.setSelectedIndividual(null);
            this.showingUpload = false;
            this.selectedFile = null;
            this.shadowRoot.getElementById('fileInput').value = '';
            this.updateUI(store);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; margin-bottom: 20px; }
                
                .no-data-state { text-align: center; padding: 40px 20px; }
                .welcome-message h3 { margin: 0 0 10px 0; color: #333; }
                .welcome-message p { margin: 0 0 30px 0; color: #666; }
                
                .single-user-state .individual-display,
                .multiple-users-state .selector-row {
                    display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
                }
                .emoji { font-size: 24px; }
                .name.failed { color: #dc3545; }
                .edit-btn { background: none; border: none; cursor: pointer; font-size: 16px; }
                .edit-btn:hover { opacity: 0.7; }
                
                select { padding: 8px; font-size: 14px; min-width: 200px; }
                select:disabled { opacity: 0.6; }
                
                .actions { display: flex; gap: 10px; }
                
                .upload-component {
                    background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px;
                    padding: 15px; margin-top: 10px;
                }
                
                .file-info {
                    font-size: 14px; color: #666; margin-bottom: 10px;
                }
                
                .upload-form .form-row {
                    display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;
                }
                
                .upload-form input {
                    padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;
                }
                
                .emoji-selector {
                    display: flex; gap: 5px; flex-wrap: wrap;
                }
                
                .emoji-btn {
                    background: #fff; border: 2px solid transparent; padding: 6px;
                    border-radius: 4px; cursor: pointer; font-size: 18px;
                }
                .emoji-btn:hover { background: #e9ecef; }
                .emoji-btn.selected { border-color: #007acc; background: #e3f2fd; }
                
                .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
                
                .status-text, .progress-text {
                    font-size: 14px; color: #666; font-style: italic;
                }
                
                .primary-btn { 
                    background: #007acc; color: white; border: none; padding: 12px 24px; 
                    border-radius: 6px; cursor: pointer; font-size: 16px;
                }
                .primary-btn:hover { background: #005a99; }
                
                .secondary-btn { 
                    background: #f0f0f0; color: #333; border: 1px solid #ccc; 
                    padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;
                }
                .secondary-btn:hover { background: #e0e0e0; }
                
                .danger-btn { 
                    background: #dc3545; color: white; border: none; 
                    padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;
                }
                .danger-btn:hover { background: #c82333; }
                
                input[type="file"] { display: none; }
            </style>
            
            <div id="container"></div>
            <input type="file" id="fileInput" accept=".txt,.csv">
        `;
    }
}

customElements.define('individual-manager', IndividualManager);