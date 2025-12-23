export class DNAUploader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.geneticDb = null;
        this.selectedIndividual = null;
    }

    async connectedCallback() {
        this.render();
        // Wait a bit for geneticDb to be set by parent
        setTimeout(() => this.loadIndividuals(), 100);
    }

    async loadIndividuals() {
        if (!this.geneticDb) return;
        const individuals = await this.geneticDb.getIndividuals();
        this.updateIndividualSelector(individuals);
    }

    updateIndividualSelector(individuals) {
        const selector = this.shadowRoot.getElementById('individualSelector');
        if (!selector) return;
        
        selector.innerHTML = '<option value="">Select dataset...</option>';
        individuals.forEach(individual => {
            const option = document.createElement('option');
            option.value = individual.id;
            option.textContent = `${individual.name} (${individual.relationship})`;
            selector.appendChild(option);
        });
        
        if (individuals.length > 0) {
            this.selectedIndividual = individuals[0].id;
            selector.value = this.selectedIndividual;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .upload-area {
                    border: 2px dashed #ccc;
                    border-radius: 8px;
                    padding: 40px;
                    text-align: center;
                    margin: 20px 0;
                    cursor: pointer;
                }
                .upload-area:hover { border-color: #007acc; }
                .upload-area.dragover { border-color: #007acc; background: #f0f8ff; }
                input[type="file"] { display: none; }
                .status { margin-top: 10px; font-size: 14px; }
                .name-input { margin: 10px 0; }
                .name-input input { padding: 8px; font-size: 14px; width: 200px; }
                .individual-selector { margin: 10px 0; }
                select { padding: 8px; font-size: 14px; }
            </style>
            <div class="individual-selector">
                <label>Active Dataset: </label>
                <select id="individualSelector">
                    <option value="">No datasets available</option>
                </select>
            </div>
            <div class="upload-area" id="uploadArea">
                <p>Drop your 23andMe or AncestryDNA file here, or click to select</p>
                <div class="name-input">
                    <input type="text" id="nameInput" placeholder="Enter name (e.g., John, Mom, Child1)" />
                </div>
                <input type="file" id="fileInput" accept=".txt,.csv">
                <div class="status" id="status"></div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const uploadArea = this.shadowRoot.getElementById('uploadArea');
        const fileInput = this.shadowRoot.getElementById('fileInput');
        const status = this.shadowRoot.getElementById('status');
        const individualSelector = this.shadowRoot.getElementById('individualSelector');

        individualSelector.addEventListener('change', (e) => {
            this.selectedIndividual = e.target.value;
            this.dispatchEvent(new CustomEvent('individual-changed', { detail: this.selectedIndividual }));
        });

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFile(e.dataTransfer.files[0], status);
        });
        fileInput.addEventListener('change', (e) => {
            this.handleFile(e.target.files[0], status);
        });
    }

    async handleFile(file, status) {
        if (!file) return;
        
        const nameInput = this.shadowRoot.getElementById('nameInput');
        const name = nameInput.value.trim();
        
        if (!name) {
            status.textContent = 'Please enter a name for this dataset';
            return;
        }
        
        status.textContent = 'Processing DNA file...';
        
        try {
            const text = await file.text();
            const individualId = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
            
            // Add individual to database
            await this.geneticDb.addIndividual(individualId, name, 'family');
            
            if (this.geneticDb) {
                const count = await this.geneticDb.importData(text, individualId, (current, total) => {
                    status.textContent = `Processing ${current}/${total} variants...`;
                });
                status.textContent = `✓ Imported ${count} genetic variants for ${name}`;
                nameInput.value = '';
                
                // Refresh individual list and select new one
                await this.loadIndividuals();
                this.selectedIndividual = individualId;
                this.shadowRoot.getElementById('individualSelector').value = individualId;
                
                this.dispatchEvent(new CustomEvent('dna-imported', { detail: { count, individualId, name } }));
            }
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
        }
    }
}

customElements.define('dna-uploader', DNAUploader);