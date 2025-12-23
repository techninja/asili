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
        console.log(`[${new Date().toISOString()}] Calculating risk with`, userDNA.length, 'user DNA variants');
        await this.loadParquet(traitUrl, 'trait_data');
        
        console.log(`[${new Date().toISOString()}] Getting trait data for matching positions...`);
        const traitResult = await this.query(`
            SELECT chr_name, chr_position, effect_allele, effect_weight 
            FROM trait_data
        `);
        const traitData = traitResult.toArray();
        
        // Clean up trait table immediately
        await this.query('DROP TABLE IF EXISTS trait_data');
        
        console.log(`[${new Date().toISOString()}] Calculating risk in JavaScript...`);
        let riskScore = 0;
        const userDNAMap = new Map();
        
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
            }
        });
        
        // Clear references for GC
        userDNAMap.clear();
        traitData.length = 0;
        
        // Force memory cleanup
        await this.conn.close();
        this.conn = await this.db.connect();
        
        if (window.gc) window.gc();
        
        console.log(`[${new Date().toISOString()}] Risk score calculated:`, riskScore);
        return riskScore;
    }
}