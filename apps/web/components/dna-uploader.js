export class DNAUploader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.duckdb = null;
    }

    connectedCallback() {
        this.render();
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
            </style>
            <div class="upload-area" id="uploadArea">
                <p>Drop your 23andMe or AncestryDNA file here, or click to select</p>
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
        
        status.textContent = 'Processing DNA file...';
        
        try {
            const text = await file.text();
            const dnaData = this.parseDNAFile(text);
            
            if (this.duckdb) {
                await this.duckdb.importDNA(dnaData);
                status.textContent = `✓ Imported ${dnaData.length} genetic variants`;
                this.dispatchEvent(new CustomEvent('dna-imported', { detail: dnaData.length }));
            }
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
        }
    }

    parseDNAFile(text) {
        const lines = text.split('\n');
        const data = [];
        
        for (const line of lines) {
            if (line.startsWith('#') || !line.trim()) continue;
            
            const parts = line.split('\t');
            if (parts.length >= 4) {
                data.push({
                    rsid: parts[0],
                    chromosome: parts[1],
                    position: parseInt(parts[2]),
                    genotype: parts[3]
                });
            }
        }
        
        return data;
    }
}

customElements.define('dna-uploader', DNAUploader);