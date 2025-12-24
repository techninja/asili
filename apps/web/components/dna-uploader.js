import { Debug } from '../lib/debug.js';

export class DNAUploader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.geneticDb = null;
        this.selectedIndividual = null;
        this.selectedFile = null;
        this.uploadState = 'idle'; // idle, file-selected, importing
    }

    async connectedCallback() {
        this.render();
        setTimeout(() => this.loadIndividuals(), 100);
    }

    async loadIndividuals() {
        if (!this.geneticDb) return;
        const individuals = await this.geneticDb.getIndividuals();
        this.updateIndividualSelector(individuals);
        this.updateStats();
    }

    updateIndividualSelector(individuals) {
        const selector = this.shadowRoot.getElementById('individualSelector');
        if (!selector) return;
        
        selector.innerHTML = '<option value="">Select individual...</option>';
        individuals.forEach(individual => {
            const option = document.createElement('option');
            option.value = individual.id;
            option.textContent = individual.name;
            selector.appendChild(option);
        });
        
        // Add "Add Individual" option
        const addOption = document.createElement('option');
        addOption.value = 'add-new';
        addOption.textContent = '+ Add Individual';
        selector.appendChild(addOption);
        
        if (individuals.length > 0 && !this.selectedIndividual && this.uploadState !== 'importing') {
            this.selectedIndividual = individuals[0].id;
            selector.value = this.selectedIndividual;
            this.updateStats();
            document.dispatchEvent(new CustomEvent('individual-changed', { 
                detail: { individualId: this.selectedIndividual, ready: true }
            }));
        } else if (individuals.length === 0) {
            // Trigger refresh when no individuals exist
            document.dispatchEvent(new CustomEvent('individual-changed', { 
                detail: { individualId: null, ready: true }
            }));
        }
    }

    async updateStats() {
        const stats = this.shadowRoot.getElementById('stats');
        if (!this.geneticDb || !stats) return;
        
        if (this.uploadState === 'importing') return;
        
        if (this.selectedIndividual) {
            stats.textContent = 'Individual selected';
        } else {
            stats.textContent = 'No individual selected';
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .dataset-selector { margin: 10px 0; }
                select { padding: 8px; font-size: 14px; width: 200px; }
                .stats { font-size: 12px; color: #666; margin-top: 5px; }
                .upload-section { margin-top: 15px; display: none; }
                .file-info { background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0; }
                .name-input { margin: 10px 0; }
                .name-input input { padding: 8px; font-size: 14px; width: 200px; }
                button { padding: 8px 16px; margin: 5px; cursor: pointer; }
                .primary { background: #007acc; color: white; border: none; border-radius: 4px; }
                .secondary { background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; }
                input[type="file"] { display: none; }
            </style>
            <div class="dataset-selector">
                <label>Individual: </label>
                <select id="individualSelector">
                    <option value="">Loading...</option>
                </select>
                <div class="stats" id="stats">No individual selected</div>
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

        this.setupEventListeners();
    }

    setupEventListeners() {
        const individualSelector = this.shadowRoot.getElementById('individualSelector');
        const fileInput = this.shadowRoot.getElementById('fileInput');
        const importBtn = this.shadowRoot.getElementById('importBtn');
        const cancelBtn = this.shadowRoot.getElementById('cancelBtn');
        const fileInfo = this.shadowRoot.getElementById('fileInfo');
        const nameInputDiv = this.shadowRoot.getElementById('nameInput');
        const nameField = this.shadowRoot.getElementById('nameField');
        const stats = this.shadowRoot.getElementById('stats');

        individualSelector.addEventListener('change', (e) => {
            if (e.target.value === 'add-new') {
                fileInput.click();
            } else {
                this.selectedIndividual = e.target.value;
                if (this.selectedIndividual) {
                    const stats = this.shadowRoot.getElementById('stats');
                    stats.textContent = 'Loading variants...';
                } else {
                    // Handle "Select individual..." selection
                    this.updateStats();
                }
                document.dispatchEvent(new CustomEvent('individual-changed', { detail: this.selectedIndividual }));
            }
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            Debug.log(2, 'DNAUploader', 'File selected:', file?.name);
            if (file) {
                this.selectedFile = file;
                const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                nameField.value = baseName;
                Debug.log(2, 'DNAUploader', 'Setting up UI for file:', baseName);
                
                // Clear current selection and hide traits
                this.selectedIndividual = null;
                stats.textContent = 'Adding new individual...';
                document.dispatchEvent(new CustomEvent('individual-changed', { detail: null }));
                
                // Show upload section and file info
                const uploadSection = this.shadowRoot.getElementById('uploadSection');
                uploadSection.style.display = 'block';
                fileInfo.style.display = 'block';
                fileInfo.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
                nameInputDiv.style.display = 'block';
                Debug.log(2, 'DNAUploader', 'Name input should now be visible');
            } else {
                Debug.log(2, 'DNAUploader', 'File selection cancelled, resetting dropdown');
                individualSelector.value = this.selectedIndividual || '';
            }
        });

        importBtn.addEventListener('click', () => {
            Debug.log(1, 'DNAUploader', 'Import button clicked');
            this.importDataset();
        });
        
        nameField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                Debug.log(2, 'DNAUploader', 'Enter pressed in name field');
                this.importDataset();
            }
        });
        
        cancelBtn.addEventListener('click', () => {
            Debug.log(2, 'DNAUploader', 'Cancel clicked');
            this.selectedFile = null;
            fileInfo.style.display = 'none';
            nameInputDiv.style.display = 'none';
            nameField.value = '';
            fileInput.value = '';
            individualSelector.value = this.selectedIndividual || '';
            if (this.selectedIndividual) {
                stats.textContent = 'Loading variants...';
                this.updateStats();
                document.dispatchEvent(new CustomEvent('individual-changed', { detail: this.selectedIndividual }));
            } else {
                stats.textContent = 'No individual selected';
            }
        });
    }

    async importDataset() {
        Debug.log(1, 'DNAUploader', 'importDataset called');
        const nameField = this.shadowRoot.getElementById('nameField');
        const stats = this.shadowRoot.getElementById('stats');
        const fileInfo = this.shadowRoot.getElementById('fileInfo');
        const nameInputDiv = this.shadowRoot.getElementById('nameInput');
        const uploadSection = this.shadowRoot.getElementById('uploadSection');
        const individualSelector = this.shadowRoot.getElementById('individualSelector');
        const name = nameField.value.trim();
        
        Debug.log(1, 'DNAUploader', 'Import name:', name);
        
        if (!name) {
            alert('Please enter an individual name');
            return;
        }
        
        // Create individual ID and add to dropdown immediately
        const individualId = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
        Debug.log(1, 'DNAUploader', 'Adding individual to database:', individualId);
        await this.geneticDb.addIndividual(individualId, name, 'family');
        
        // Read file before clearing selectedFile
        Debug.log(2, 'DNAUploader', 'Reading file text');
        const text = await this.selectedFile.text();
        
        // Hide upload UI and select new individual
        uploadSection.style.display = 'none';
        this.selectedFile = null;
        nameField.value = '';
        this.shadowRoot.getElementById('fileInput').value = '';
        
        // Refresh dropdown and select new individual immediately
        this.uploadState = 'importing'; // Set importing state BEFORE loadIndividuals
        await this.loadIndividuals();
        this.selectedIndividual = individualId;
        individualSelector.value = individualId;
        
        // Start import process
        stats.textContent = 'Processing DNA file...';
        
        // Dispatch event to clear trait cards during import
        document.dispatchEvent(new CustomEvent('individual-changed', { 
            detail: { individualId, ready: false }
        }));
        
        try {
            Debug.log(1, 'DNAUploader', 'Starting import process');
            const count = await this.geneticDb.importData(text, individualId, (current, total) => {
                stats.textContent = `Importing ${current.toLocaleString()}/${total.toLocaleString()} variants...`;
            });
            
            Debug.log(1, 'DNAUploader', 'Import complete, count:', count);
            
            // Reset state and select individual after import completion
            this.uploadState = 'idle';
            this.selectedIndividual = individualId;
            individualSelector.value = individualId;
            stats.textContent = `${count.toLocaleString()} variants loaded`;
            
            Debug.log(1, 'DNAUploader', 'Dispatching events for new individual');
            this.dispatchEvent(new CustomEvent('dna-imported', { detail: { count, individualId, name } }));
            // Only dispatch individual-changed after import is complete
            document.dispatchEvent(new CustomEvent('individual-changed', { 
                detail: { individualId, ready: true }
            }));
            
        } catch (error) {
            Debug.error('DNAUploader', 'Import error:', error);
            this.uploadState = 'idle';
            stats.textContent = `Error: ${error.message}`;
        }
    }
}

customElements.define('dna-uploader', DNAUploader);