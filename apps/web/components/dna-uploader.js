import { Debug } from '@asili/debug';
import { useAppStore } from '../lib/store.js';
import { AsiliProcessor } from '../lib/asili-processor.js';
import { PROGRESS_STAGES } from '../../packages/core/src/index.js';
import './progress-bar.js';

export class DNAUploader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.processor = null;
        this.selectedFile = null;
        this.unsubscribe = null;
        this.progressUnsubscribe = null;
    }

    async connectedCallback() {
        this.render();
        this.setupEventListeners();
        
        // Initialize processor
        await this.initializeProcessor();
        
        // Subscribe to state changes
        this.unsubscribe = useAppStore.subscribe((state) => {
            this.updateUI(state);
        });
        
        setTimeout(() => this.loadIndividuals(), 100);
    }



    async initializeProcessor() {
        try {
            this.processor = new AsiliProcessor();
            await this.processor.initialize();
            Debug.log('DNAUploader', 'Asili processor initialized');
        } catch (error) {
            Debug.error('DNAUploader', 'Failed to initialize processor:', error);
        }
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.progressUnsubscribe?.();
        this.processor?.cleanup();
    }

    async loadIndividuals() {
        if (!this.processor?.storage) return;
        
        try {
            const individuals = await this.processor.storage.getIndividuals();
            const store = useAppStore.getState();
            
            store.setIndividuals(individuals);
            
            // Auto-select first individual if none selected
            if (individuals.length > 0 && !store.selectedIndividual && store.uploadState === 'idle') {
                store.setSelectedIndividual(individuals[0].id);
            }
        } catch (error) {
            Debug.error('DNAUploader', 'Failed to load individuals:', error);
        }
    }

    updateUI(state) {
        const selector = this.shadowRoot.getElementById('individualSelector');
        const actionButton = this.shadowRoot.getElementById('actionButton');
        const stats = this.shadowRoot.getElementById('stats');
        
        if (!selector || !actionButton || !stats) return;
        
        // Update selector options
        selector.innerHTML = '<option value="">Select individual...</option>';
        state.individuals.forEach(individual => {
            const option = document.createElement('option');
            option.value = individual.id;
            option.textContent = individual.name;
            selector.appendChild(option);
        });
        selector.value = state.selectedIndividual || '';
        
        // Update action button
        if (state.selectedIndividual) {
            actionButton.textContent = 'Delete Individual Data';
            actionButton.style.background = '#dc3545';
            actionButton.onclick = () => this.deleteIndividual();
        } else {
            actionButton.textContent = '+ Add Individual';
            actionButton.style.background = '#007acc';
            actionButton.onclick = () => this.shadowRoot.getElementById('fileInput').click();
        }
        
        // Update stats
        if (state.uploadState === 'importing') {
            // Keep current import status
        } else if (state.uploadState === 'deleting') {
            // Keep current delete status
        } else if (state.selectedIndividual) {
            stats.textContent = 'Individual selected';
        } else {
            stats.textContent = state.individuals.length > 0 ? 'Select an individual' : 'Add an individual to get started';
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .dataset-selector { margin: 10px 0; display: flex; align-items: center; gap: 10px; }
                select { padding: 8px; font-size: 14px; width: 200px; }
                button { padding: 8px 16px; font-size: 14px; cursor: pointer; border: none; border-radius: 4px; color: white; }
                .stats { font-size: 12px; color: #666; margin-top: 5px; }
                .upload-section { margin-top: 15px; display: none; }
                .file-info { background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0; }
                .name-input { margin: 10px 0; }
                .name-input input { padding: 8px; font-size: 14px; width: 200px; }
                .primary { background: #007acc; }
                .secondary { background: #f0f0f0; color: #333; border: 1px solid #ccc; }
                input[type="file"] { display: none; }
                .progress-section { margin: 15px 0; }
                .hidden { display: none; }
            </style>
            <div class="dataset-selector">
                <label>Individual: </label>
                <select id="individualSelector">
                    <option value="">Loading...</option>
                </select>
                <button id="actionButton">+ Add Individual</button>
            </div>
            <div class="stats" id="stats">Loading...</div>
            
            <div class="progress-section">
                <progress-bar id="progressBar" class="hidden"></progress-bar>
            </div>
            
            <div class="upload-section" id="uploadSection">
                <div class="file-info" id="fileInfo" style="display: none;"></div>
                <div class="name-input" id="nameInput" style="display: none;">
                    <input type="text" id="nameField" placeholder="Individual name" />
                    <button class="primary" id="importBtn">Import</button>
                    <button class="secondary" id="cancelBtn">Cancel</button>
                </div>
                <input type="file" id="fileInput" accept=".txt,.csv">
            </div>
        `;
    }

    setupEventListeners() {
        const individualSelector = this.shadowRoot.getElementById('individualSelector');
        const fileInput = this.shadowRoot.getElementById('fileInput');
        const importBtn = this.shadowRoot.getElementById('importBtn');
        const cancelBtn = this.shadowRoot.getElementById('cancelBtn');
        const nameField = this.shadowRoot.getElementById('nameField');

        individualSelector.addEventListener('change', (e) => {
            useAppStore.getState().setSelectedIndividual(e.target.value);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.selectedFile = file;
                const baseName = file.name.replace(/\.[^/.]+$/, "");
                nameField.value = baseName;
                
                const uploadSection = this.shadowRoot.getElementById('uploadSection');
                const fileInfo = this.shadowRoot.getElementById('fileInfo');
                const nameInputDiv = this.shadowRoot.getElementById('nameInput');
                
                uploadSection.style.display = 'block';
                fileInfo.style.display = 'block';
                fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
                nameInputDiv.style.display = 'block';
            }
        });

        importBtn.addEventListener('click', () => this.importDataset());
        nameField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.importDataset();
        });
        
        cancelBtn.addEventListener('click', () => {
            this.selectedFile = null;
            this.shadowRoot.getElementById('fileInfo').style.display = 'none';
            this.shadowRoot.getElementById('nameInput').style.display = 'none';
            nameField.value = '';
            fileInput.value = '';
        });
    }

    async importDataset() {
        const nameField = this.shadowRoot.getElementById('nameField');
        const stats = this.shadowRoot.getElementById('stats');
        const progressBar = this.shadowRoot.getElementById('progressBar');
        const name = nameField.value.trim();
        
        if (!name) {
            alert('Please enter an individual name');
            return;
        }
        
        if (!this.processor) {
            alert('Processor not initialized. Please wait and try again.');
            return;
        }
        
        const store = useAppStore.getState();
        store.setUploadState('importing');
        
        // Show progress bar
        progressBar.classList.remove('hidden');
        
        // Subscribe to progress updates
        this.progressUnsubscribe = this.processor.onProgress((status) => {
            if (progressBar && typeof progressBar.setStatus === 'function') {
                progressBar.setStatus(status);
            }
            
            // Update stats with current progress
            if (status.message) {
                stats.textContent = status.message;
            }
        });
        
        try {
            const individualId = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
            
            // Import DNA using Asili Core
            const result = await this.processor.importDNA(this.selectedFile, individualId, name);
            
            // Clean up
            this.selectedFile = null;
            nameField.value = '';
            this.shadowRoot.getElementById('fileInput').value = '';
            progressBar.classList.add('hidden');
            
            // Update store with new individual
            await this.loadIndividuals();
            store.setSelectedIndividual(individualId, true);
            store.setUploadState('idle');
            
            stats.textContent = `Import complete - ${result.variantCount.toLocaleString()} variants stored`;
            
            Debug.log('DNAUploader', 'Import completed successfully', result);
            
        } catch (error) {
            Debug.error('DNAUploader', 'Import error:', error);
            store.setUploadState('idle');
            progressBar.classList.add('hidden');
            stats.textContent = `Error: ${error.message}`;
        } finally {
            this.progressUnsubscribe?.();
            this.progressUnsubscribe = null;
        }
    }

    async deleteIndividual() {
        const store = useAppStore.getState();
        if (!store.selectedIndividual || !confirm('Delete all data for this individual?')) return;
        
        const stats = this.shadowRoot.getElementById('stats');
        const individualId = store.selectedIndividual;
        
        store.setUploadState('deleting');
        
        try {
            stats.textContent = 'Deleting individual data...';
            
            // Use Asili core storage for deletion
            const storage = this.processor.storage;
            
            // Clear cached risk scores
            await this.processor.clearCachedResults(individualId);
            
            // Delete from core storage (this will handle all stores)
            const db = await storage._getDB();
            const transaction = db.transaction(['variants', 'individuals', 'risk_scores'], 'readwrite');
            
            // Delete variants
            const variantStore = transaction.objectStore('variants');
            const variantIndex = variantStore.index('individualId');
            const variantRequest = variantIndex.openCursor(individualId);
            variantRequest.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            
            // Delete individual
            transaction.objectStore('individuals').delete(individualId);
            
            // Delete risk scores
            const riskStore = transaction.objectStore('risk_scores');
            const riskRequest = riskStore.openCursor();
            riskRequest.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && cursor.value.individualId === individualId) {
                    cursor.delete();
                }
                if (cursor) cursor.continue();
            };
            
            await new Promise((resolve) => {
                transaction.oncomplete = resolve;
            });
            
            store.setSelectedIndividual(null);
            store.setUploadState('idle');
            await this.loadIndividuals();
            
            stats.textContent = 'Individual deleted';
            
        } catch (error) {
            Debug.error('DNAUploader', 'Delete failed:', error);
            store.setUploadState('idle');
            stats.textContent = 'Delete failed';
        }
    }
}

customElements.define('dna-uploader', DNAUploader);