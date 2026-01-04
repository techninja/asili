import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../../cache');
const PGS_FILES_DIR = path.join(CACHE_DIR, 'pgs_files');
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

class PGSApiClient {
    constructor() {
        this.requestTimes = [];
    }

    async ensureCacheDir() {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.mkdir(PGS_FILES_DIR, { recursive: true });
    }

    getCacheFilePath(url) {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const endpoint = pathParts.join('_');
        
        // Create hash from query parameters for unique filenames
        const queryHash = urlObj.search ? 
            crypto.createHash('md5').update(urlObj.search).digest('hex').substring(0, 8) : 
            'no-params';
        
        const cacheDir = path.join(CACHE_DIR, domain, endpoint);
        const fileName = `${queryHash}.json`;
        
        return { dir: cacheDir, file: path.join(cacheDir, fileName) };
    }

    async loadFromCache(url) {
        const { file: filePath } = this.getCacheFilePath(url);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const cached = JSON.parse(data);
            
            // Check if cache is less than 30 days old
            const age = Date.now() - cached.timestamp;
            if (age < 30 * 24 * 60 * 60 * 1000) {
                return cached.data;
            }
        } catch {}
        return null;
    }

    async saveToCache(url, data) {
        const { dir: cacheDir, file: filePath } = this.getCacheFilePath(url);
        await fs.mkdir(cacheDir, { recursive: true });
        
        const cached = {
            data,
            timestamp: Date.now(),
            url
        };
        
        await fs.writeFile(filePath, JSON.stringify(cached, null, 2));
    }

    async waitForRateLimit() {
        const now = Date.now();
        
        // Remove requests older than 1 minute
        this.requestTimes = this.requestTimes.filter(time => now - time < RATE_WINDOW);
        
        // If we're at the limit, wait
        if (this.requestTimes.length >= RATE_LIMIT) {
            const oldestRequest = Math.min(...this.requestTimes);
            const waitTime = RATE_WINDOW - (now - oldestRequest) + 100; // +100ms buffer
            
            if (waitTime > 0) {
                console.log(`Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        this.requestTimes.push(now);
    }

    async fetchWithCache(url, cacheKey, retries = 3) {
        await this.ensureCacheDir();
        
        // Check cache first
        const cachedData = await this.loadFromCache(url);
        if (cachedData) {
            return cachedData;
        }
        
        // Rate limit before making request
        await this.waitForRateLimit();
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: { 'accept': 'application/json' }
                });
                
                if (!response.ok) {
                    let responseText = '';
                    try {
                        responseText = await response.text();
                    } catch {}
                    
                    console.log(`❌ HTTP ${response.status} ${response.statusText} - ${url}`);
                    console.log(`Response: ${responseText.substring(0, 500)}`);
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // Cache the result
                await this.saveToCache(url, data);
                return data;
                
            } catch (error) {
                console.log(`❌ RETRY ${attempt}/${retries} - ${url}`);
                console.log(`Error: ${error.message}`);
                console.log(`Error code: ${error.code || 'none'}`);
                console.log(`Error cause: ${error.cause || 'none'}`);
                
                const isNetworkError = error.message.includes('fetch failed') || 
                                     error.message.includes('ECONNRESET') ||
                                     error.message.includes('ENOTFOUND') ||
                                     error.message.includes('ETIMEDOUT');
                
                if (attempt === retries) {
                    console.log(`❌ FINAL FAILURE after ${retries} attempts`);
                    throw error;
                }
                
                const backoffTime = isNetworkError ? 30000 * attempt : 5000 * attempt;
                console.log(`Backing off ${backoffTime/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }
    }

    async searchTraits(query) {
        const url = `https://www.pgscatalog.org/rest/trait/search?term=${encodeURIComponent(query)}&exact=0&include_children=1`;
        return this.fetchWithCache(url);
    }

    async searchTraitsByMondo(mondoId) {
        const url = `https://www.pgscatalog.org/rest/trait/search?term=${encodeURIComponent(mondoId)}&exact=1`;
        return this.fetchWithCache(url);
    }

    async getTraitInfo(traitId) {
        // Handle both MONDO and EFO formats
        let url;
        if (traitId.startsWith('MONDO:')) {
            url = `https://www.pgscatalog.org/rest/trait/${traitId}`;
        } else if (traitId.startsWith('EFO_')) {
            url = `https://www.pgscatalog.org/rest/trait/${traitId}`;
        } else {
            // Try as direct ID
            url = `https://www.pgscatalog.org/rest/trait/${traitId}`;
        }
        return this.fetchWithCache(url);
    }

    async getScoresByTrait(mondoId) {
        const url = `https://www.pgscatalog.org/rest/score/search?trait_id=${encodeURIComponent(mondoId)}`;
        return this.fetchWithCache(url);
    }

    async getScore(pgsId) {
        const url = `https://www.pgscatalog.org/rest/score/${pgsId}`;
        return this.fetchWithCache(url);
    }

    async getScoreFile(pgsId) {
        const url = `https://www.pgscatalog.org/rest/score/${pgsId}/scoring_file/`;
        return this.fetchWithCache(url);
    }

    async downloadPGSFile(pgsId, downloadUrl) {
        const fileName = `${pgsId}.txt.gz`;
        const filePath = path.join(PGS_FILES_DIR, fileName);
        
        // Ensure PGS files directory exists
        await fs.mkdir(PGS_FILES_DIR, { recursive: true });
        
        // Check if file already exists
        try {
            await fs.access(filePath);
            console.log(`        Using cached PGS file: ${fileName}`);
            return filePath;
        } catch {
            // File doesn't exist, download it
        }
        
        console.log(`        Downloading PGS file: ${fileName}`);
        await this.waitForRateLimit();
        
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Failed to download ${downloadUrl}: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        await fs.writeFile(filePath, new Uint8Array(buffer));
        
        return filePath;
    }
}

// Singleton instance
const pgsApiClient = new PGSApiClient();
export default pgsApiClient;