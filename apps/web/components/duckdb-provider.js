import { Debug } from '../lib/debug.js';
import { getMatchingDataForFormat, getFormatFromColumns } from '../lib/pgs-schema.js';
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
        
        // Detect format by checking columns
        const columnsResult = await this.query('PRAGMA table_info(trait_data)');
        const columns = columnsResult.toArray().map(row => row.name);
        const formatInfo = getFormatFromColumns(columns);
        
        if (!formatInfo) {
            throw new Error(`Unsupported format - columns: ${columns.join(', ')}`);
        }
        
        Debug.log(2, 'DuckDB', 'Detected format:', formatInfo.format.name);
        
        // Get trait data using format-specific query
        const query = getMatchingDataForFormat(formatInfo.key, 'trait_data');
        const traitResult = await this.query(query);
        const traitData = traitResult.toArray();
        
        // Clean up trait table immediately
        await this.query('DROP TABLE IF EXISTS trait_data');
        
        Debug.log(2, 'DuckDB', 'Calculating risk across', new Set(traitData.map(t => t.pgs_id)).size, 'PGS scores...');
        let riskScore = 0;
        const userDNAMap = new Map();
        const pgsBreakdown = new Map();
        
        // Create lookup map for user DNA based on format
        if (formatInfo.format.matchingStrategy === 'position') {
            userDNA.forEach(snp => {
                const key = `${snp.chromosome}:${snp.position}`;
                userDNAMap.set(key, snp.allele1 + snp.allele2);
            });
        } else if (formatInfo.format.matchingStrategy === 'rsid' || formatInfo.format.matchingStrategy === 'variant_id') {
            userDNA.forEach(snp => {
                userDNAMap.set(snp.rsid, snp.allele1 + snp.allele2);
            });
        }
        
        // Calculate risk for matching variants
        traitData.forEach(trait => {
            // Initialize PGS tracking
            if (!pgsBreakdown.has(trait.pgs_id)) {
                pgsBreakdown.set(trait.pgs_id, { positive: 0, negative: 0, positiveSum: 0, negativeSum: 0, total: 0 });
            }
            pgsBreakdown.get(trait.pgs_id).total++;
            
            let key, genotype;
            
            if (formatInfo.format.matchingStrategy === 'position') {
                key = `${trait.chr_name}:${trait.chr_position}`;
                genotype = userDNAMap.get(key);
            } else if (formatInfo.format.matchingStrategy === 'rsid') {
                key = trait.rsid;
                genotype = userDNAMap.get(key);
            } else if (formatInfo.format.matchingStrategy === 'variant_id') {
                key = trait.variant_id;
                genotype = userDNAMap.get(key);
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
        
        Debug.log(2, 'DuckDB', 'PGS breakdown:', Object.fromEntries(pgsBreakdown));
        
        // Clear references for GC
        userDNAMap.clear();
        traitData.length = 0;
        
        // Force memory cleanup
        await this.conn.close();
        this.conn = await this.db.connect();
        
        if (window.gc) window.gc();
        
        Debug.log(1, 'DuckDB', 'Risk score calculated:', riskScore);
        return { riskScore, pgsBreakdown: Object.fromEntries(pgsBreakdown) };
    }
}