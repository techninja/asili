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

    async loadParquet(url, tableName, progressCallback) {
        progressCallback?.('Loading parquet file...', 0);
        await this.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM '${url}'`);
        progressCallback?.('Parquet loaded', 100);
    }

    async calculateRisk(traitUrl, userDNA, progressCallback) {
        Debug.log(1, 'DuckDB', 'Calculating risk with', userDNA.length, 'user DNA variants');
        
        progressCallback?.('Loading trait data...', 0);
        await this.loadParquet(traitUrl, 'trait_data', progressCallback);
        
        // Get total count for progress
        progressCallback?.('Counting variants...', 10);
        const countResult = await this.query('SELECT COUNT(*) as total FROM trait_data');
        const totalVariants = Number(countResult.toArray()[0].total);
        
        Debug.log(2, 'DuckDB', 'Processing', totalVariants, 'variants in chunks');
        
        // Process in chunks to avoid memory issues
        const CHUNK_SIZE = 50000;
        let riskScore = 0;
        const pgsBreakdown = new Map();
        
        // Create lookup map for user DNA
        const userDNAMap = new Map();
        userDNA.forEach(snp => {
            // Try multiple keys for matching
            if (snp.rsid) userDNAMap.set(snp.rsid, snp.allele1 + snp.allele2);
            if (snp.chromosome && snp.position) {
                userDNAMap.set(`${snp.chromosome}:${snp.position}`, snp.allele1 + snp.allele2);
            }
        });
        
        // Process chunks
        for (let offset = 0; offset < totalVariants; offset += CHUNK_SIZE) {
            const progress = 20 + (offset / totalVariants * 70);
            progressCallback?.(`Processing chunk ${Math.floor(offset/CHUNK_SIZE) + 1}/${Math.ceil(totalVariants/CHUNK_SIZE)}...`, progress);
            
            const chunkResult = await this.query(`SELECT * FROM trait_data LIMIT ${CHUNK_SIZE} OFFSET ${offset}`);
            const chunkData = chunkResult.toArray();
            
            // Process chunk
            chunkData.forEach(trait => {
                // Initialize PGS tracking
                if (!pgsBreakdown.has(trait.pgs_id)) {
                    pgsBreakdown.set(trait.pgs_id, { positive: 0, negative: 0, positiveSum: 0, negativeSum: 0, total: 0 });
                }
                pgsBreakdown.get(trait.pgs_id).total++;
                
                // Try to match variant using available identifiers
                let genotype = null;
                if (trait.variant_id && userDNAMap.has(trait.variant_id)) {
                    genotype = userDNAMap.get(trait.variant_id);
                } else if (trait.chr_name && trait.chr_position) {
                    const posKey = `${trait.chr_name}:${trait.chr_position}`;
                    if (userDNAMap.has(posKey)) {
                        genotype = userDNAMap.get(posKey);
                    }
                }
                
                if (genotype && genotype.includes(trait.effect_allele)) {
                    riskScore += trait.effect_weight;
                    
                    const breakdown = pgsBreakdown.get(trait.pgs_id);
                    if (trait.effect_weight > 0) {
                        breakdown.positive++;
                        breakdown.positiveSum += trait.effect_weight;
                    } else {
                        breakdown.negative++;
                        breakdown.negativeSum += trait.effect_weight;
                    }
                }
            });
        }
        
        progressCallback?.('Finalizing...', 95);
        
        // Clean up trait table
        await this.query('DROP TABLE IF EXISTS trait_data');
        
        Debug.log(2, 'DuckDB', 'PGS breakdown:', Object.fromEntries(pgsBreakdown));
        
        // Clear references for GC
        userDNAMap.clear();
        
        // Force memory cleanup
        await this.conn.close();
        this.conn = await this.db.connect();
        
        if (window.gc) window.gc();
        
        Debug.log(1, 'DuckDB', 'Risk score calculated:', riskScore);
        progressCallback?.('Complete', 100);
        return { riskScore, pgsBreakdown: Object.fromEntries(pgsBreakdown) };
    }
}