import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '.pgs-api-cache.json');
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

class PGSApiClient {
    constructor() {
        this.requestTimes = [];
        this.cache = null;
    }

    async loadCache() {
        if (this.cache) return this.cache;
        
        try {
            const data = await fs.readFile(CACHE_FILE, 'utf8');
            this.cache = JSON.parse(data);
        } catch {
            this.cache = { requests: {}, lastCleanup: Date.now() };
        }
        
        // Clean old cache entries (older than 24 hours)
        const now = Date.now();
        if (now - this.cache.lastCleanup > 24 * 60 * 60 * 1000) {
            const cutoff = now - 24 * 60 * 60 * 1000;
            for (const [key, entry] of Object.entries(this.cache.requests)) {
                if (entry.timestamp < cutoff) {
                    delete this.cache.requests[key];
                }
            }
            this.cache.lastCleanup = now;
            await this.saveCache();
        }
        
        return this.cache;
    }

    async saveCache() {
        if (this.cache) {
            await fs.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        }
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

    async fetchWithCache(url, cacheKey) {
        const cache = await this.loadCache();
        
        // Check cache first
        if (cache.requests[cacheKey]) {
            const entry = cache.requests[cacheKey];
            const age = Date.now() - entry.timestamp;
            
            // Use cache if less than 1 hour old
            if (age < 60 * 60 * 1000) {
                return entry.data;
            }
        }
        
        // Rate limit before making request
        await this.waitForRateLimit();
        
        try {
            const response = await fetch(url, {
                headers: { 'accept': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the result
            cache.requests[cacheKey] = {
                data,
                timestamp: Date.now()
            };
            
            await this.saveCache();
            return data;
            
        } catch (error) {
            console.log(`API request failed: ${error.message}`);
            throw error;
        }
    }

    async searchTraits(query) {
        const cacheKey = `trait_search_${query}`;
        const url = `https://www.pgscatalog.org/rest/trait/search?term=${encodeURIComponent(query)}&exact=0&include_children=1`;
        return this.fetchWithCache(url, cacheKey);
    }

    async getScore(pgsId) {
        const cacheKey = `score_${pgsId}`;
        const url = `https://www.pgscatalog.org/rest/score/${pgsId}`;
        return this.fetchWithCache(url, cacheKey);
    }

    async getScoreFile(pgsId) {
        const cacheKey = `score_file_${pgsId}`;
        const url = `https://www.pgscatalog.org/rest/score/${pgsId}/scoring_file/`;
        return this.fetchWithCache(url, cacheKey);
    }
}

// Singleton instance
const pgsApiClient = new PGSApiClient();
export default pgsApiClient;