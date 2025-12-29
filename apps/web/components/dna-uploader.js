import { Debug } from '../lib/debug.js';
import { useAppStore } from '../lib/store.js';

export class DNAUploader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.geneticDb = null;
        this.selectedFile = null;
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        
        // Subscribe to state changes
        this.unsubscribe = useAppStore.subscribe((state) => {
            this.updateUI(state);
        });
        
        setTimeout(() => this.loadIndividuals(), 100);
    }

    disconnectedCallback() {
        this.unsubscribe?.();
    }

    async loadIndividuals() {
        if (!this.geneticDb) return;
        const individuals = await this.geneticDb.getIndividuals();
        const store = useAppStore.getState();
        
        store.setIndividuals(individuals);
        
        // Auto-select first individual if none selected
        if (individuals.length > 0 && !store.selectedIndividual && store.uploadState === 'idle') {
            store.setSelectedIndividual(individuals[0].id);
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
            </style>
            <div class="dataset-selector">
                <label>Individual: </label>
                <select id="individualSelector">
                    <option value="">Loading...</option>
                </select>
                <button id="actionButton">+ Add Individual</button>
            </div>
            <div class="stats" id="stats">Loading...</div>
            
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
        const name = nameField.value.trim();
        
        if (!name) {
            alert('Please enter an individual name');
            return;
        }
        
        const store = useAppStore.getState();
        store.setUploadState('importing');
        
        try {
            const individualId = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
            await this.geneticDb.addIndividual(individualId, name, 'family');
            
            const text = await this.selectedFile.text();
            
            // Hide upload UI
            this.shadowRoot.getElementById('uploadSection').style.display = 'none';
            this.selectedFile = null;
            nameField.value = '';
            this.shadowRoot.getElementById('fileInput').value = '';
            
            stats.textContent = 'Processing DNA file...';
            
            const count = await this.geneticDb.importData(text, individualId, (current, total) => {
                stats.textContent = `Importing ${current.toLocaleString()}/${total.toLocaleString()} variants...`;
            });
            
            // Update store with new individual
            await this.loadIndividuals();
            store.setSelectedIndividual(individualId, false); // Not ready yet
            store.setUploadState('idle');
            
            // Mark as ready after import
            store.setIndividualReady(true);
            
            stats.textContent = `${count.toLocaleString()} variants loaded`;
            
        } catch (error) {
            Debug.error('DNAUploader', 'Import error:', error);
            useAppStore.getState().setUploadState('idle');
            stats.textContent = `Error: ${error.message}`;
        }
    }

    async deleteIndividual() {
        const store = useAppStore.getState();
        if (!store.selectedIndividual || !confirm('Delete all data for this individual?')) return;
        
        const stats = this.shadowRoot.getElementById('stats');
        const individualId = store.selectedIndividual;
        
        store.setUploadState('deleting');
        
        try {
            stats.textContent = 'Deleting cached results...';
            
            const transaction = this.geneticDb.db.transaction(['risk_cache', 'pgs_details', 'snps', 'individuals', 'individual_metadata'], 'readwrite');
            
            // Delete all data for individual
            const stores = ['risk_cache', 'pgs_details', 'snps'];
            stores.forEach(storeName => {
                const objectStore = transaction.objectStore(storeName);
                const cursor = objectStore.openCursor();
                cursor.onsuccess = (e) => {
                    const result = e.target.result;
                    if (result) {
                        if (result.value.individualId === individualId) result.delete();
                        result.continue();
                    }
                };
            });
            
            transaction.objectStore('individuals').delete(individualId);
            transaction.objectStore('individual_metadata').delete(individualId);
            
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