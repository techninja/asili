import { Debug } from '../lib/debug.js';
import * as duckdb from '@duckdb/duckdb-wasm';

export class DuckDBProvider {
    constructor() {
        this.db = null;
        this.conn = null;
    }

    async init() {
        const bundle = {
            mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
            mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
            pthreadWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js'
        };
        
        const worker = new Worker(bundle.mainWorker);
        const logger = new duckdb.VoidLogger(); // Disable logging
        
        this.db = new duckdb.AsyncDuckDB(logger, worker);
        await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        this.conn = await this.db.connect();
    }

    async query(sql) {
        return await this.conn.query(sql);
    }

    async loadParquet(url, tableName) {
        await this.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM '${url}'`);
    }

    async calculateRisk(traitUrl, userDNA) {
        Debug.log(1, 'DuckDB', 'Calculating risk with', userDNA.length, 'user DNA variants');
        await this.loadParquet(traitUrl, 'trait_data');
        
        Debug.log(2, 'DuckDB', 'Getting trait data for matching positions...');
        const traitResult = await this.query(`
            SELECT chr_name, chr_position, effect_allele, effect_weight, pgs_id 
            FROM trait_data
        `);
        const traitData = traitResult.toArray();
        
        // Clean up trait table immediately
        await this.query('DROP TABLE IF EXISTS trait_data');
        
        Debug.log(2, 'DuckDB', 'Calculating risk across', new Set(traitData.map(t => t.pgs_id)).size, 'PGS scores...');
        let riskScore = 0;
        const userDNAMap = new Map();
        const pgsContributions = new Map();
        
        // Create lookup map for user DNA
        userDNA.forEach(snp => {
            const key = `${snp.chromosome}:${snp.position}`;
            userDNAMap.set(key, snp.allele1 + snp.allele2);
        });
        
        // Calculate risk for matching positions
        traitData.forEach(trait => {
            const key = `${trait.chr_name}:${trait.chr_position}`;
            const genotype = userDNAMap.get(key);
            if (genotype && genotype.includes(trait.effect_allele)) {
                riskScore += trait.effect_weight;
                
                // Track PGS contributions for coverage analysis
                if (!pgsContributions.has(trait.pgs_id)) {
                    pgsContributions.set(trait.pgs_id, 0);
                }
                pgsContributions.set(trait.pgs_id, pgsContributions.get(trait.pgs_id) + 1);
            }
        });
        
        Debug.log(2, 'DuckDB', 'PGS coverage:', Object.fromEntries(pgsContributions));
        
        // Clear references for GC
        userDNAMap.clear();
        traitData.length = 0;
        
        // Force memory cleanup
        await this.conn.close();
        this.conn = await this.db.connect();
        
        if (window.gc) window.gc();
        
        Debug.log(1, 'DuckDB', 'Risk score calculated:', riskScore);
        return riskScore;
    }
}