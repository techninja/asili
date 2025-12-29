import { Debug } from '../lib/debug.js';
import * as duckdb from '@duckdb/duckdb-wasm';
import { MemoryMonitor } from '../lib/memory-monitor.js';

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

    async calculateRisk(traitUrl, userDNA, progressCallback, pgsMetadata = {}) {
        Debug.log(1, 'DuckDB', 'Calculating risk with', userDNA.length, 'user DNA variants');
        MemoryMonitor.logMemoryUsage('Risk calculation start');
        
        // Check memory before starting
        if (!MemoryMonitor.checkMemoryAvailable(200)) {
            throw new Error('Insufficient memory available for calculation');
        }
        
        progressCallback?.('Loading trait data...', 0);
        await this.loadParquet(traitUrl, 'trait_data', progressCallback);
        
        // Get total count for progress
        progressCallback?.('Counting variants...', 10);
        const countResult = await this.query('SELECT COUNT(*) as total FROM trait_data');
        const totalVariants = Number(countResult.toArray()[0].total);
        
        Debug.log(2, 'DuckDB', 'Processing', totalVariants, 'variants in small batches');
        
        // Adaptive chunk size based on memory pressure and dataset size
        const memoryPressure = MemoryMonitor.getMemoryPressureLevel();
        let CHUNK_SIZE;
        
        if (memoryPressure === 'critical') {
            CHUNK_SIZE = 1000;
        } else if (memoryPressure === 'high' || totalVariants > 5000000) {
            CHUNK_SIZE = 2500;
        } else if (totalVariants > 1000000) {
            CHUNK_SIZE = 5000;
        } else {
            CHUNK_SIZE = 25000;
        }
        
        Debug.log(2, 'DuckDB', `Using chunk size: ${CHUNK_SIZE} (memory pressure: ${memoryPressure})`);
        
        let riskScore = 0;
        const pgsBreakdown = new Map();
        const pgsDetails = new Map(); // Store detailed variant data for breakdown
        
        // Create compact lookup structures
        const rsidMap = new Map();
        const posMap = new Map();
        
        userDNA.forEach(snp => {
            const genotype = snp.allele1 + snp.allele2;
            if (snp.rsid) rsidMap.set(snp.rsid, genotype);
            if (snp.chromosome && snp.position) {
                posMap.set(`${snp.chromosome}:${snp.position}`, genotype);
            }
        });
        
        Debug.log(2, 'DuckDB', `Created lookup maps: ${rsidMap.size} rsids, ${posMap.size} positions`);
        MemoryMonitor.logMemoryUsage('After lookup creation');
        
        // Process in smaller chunks with memory cleanup
        for (let offset = 0; offset < totalVariants; offset += CHUNK_SIZE) {
            const progress = 20 + (offset / totalVariants * 70);
            const chunkNum = Math.floor(offset/CHUNK_SIZE) + 1;
            const totalChunks = Math.ceil(totalVariants/CHUNK_SIZE);
            
            progressCallback?.(`Processing batch ${chunkNum}/${totalChunks}...`, progress);
            
            // Check memory pressure during processing
            if (chunkNum % 50 === 0) {
                const currentPressure = MemoryMonitor.getMemoryPressureLevel();
                if (currentPressure === 'critical') {
                    await MemoryMonitor.forceGarbageCollection();
                    MemoryMonitor.logMemoryUsage(`After GC at chunk ${chunkNum}`);
                }
            }
            
            // Use streaming query to reduce memory footprint
            const chunkResult = await this.query(`
                SELECT pgs_id, variant_id, chr_name, chr_position, effect_allele, effect_weight 
                FROM trait_data 
                LIMIT ${CHUNK_SIZE} OFFSET ${offset}
            `);
            
            const chunkData = chunkResult.toArray();
            
            // Process chunk with minimal memory allocation
            for (const trait of chunkData) {
                // Initialize PGS tracking lazily
                if (!pgsBreakdown.has(trait.pgs_id)) {
                    pgsBreakdown.set(trait.pgs_id, { positive: 0, negative: 0, positiveSum: 0, negativeSum: 0, total: 0 });
                    pgsDetails.set(trait.pgs_id, { variants: [], metadata: pgsMetadata[trait.pgs_id] || {} });
                }
                pgsBreakdown.get(trait.pgs_id).total++;
                
                // Store variant details for breakdown
                const variantDetail = {
                    rsid: trait.variant_id,
                    effect_allele: trait.effect_allele,
                    effect_weight: trait.effect_weight
                };
                
                // Fast lookup with early exit
                let genotype = null;
                if (trait.variant_id && rsidMap.has(trait.variant_id)) {
                    genotype = rsidMap.get(trait.variant_id);
                } else if (trait.chr_name && trait.chr_position) {
                    const posKey = `${trait.chr_name}:${trait.chr_position}`;
                    if (posMap.has(posKey)) {
                        genotype = posMap.get(posKey);
                    }
                }
                
                // Add genotype to variant detail
                variantDetail.userGenotype = genotype;
                pgsDetails.get(trait.pgs_id).variants.push(variantDetail);
                
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
                    
                    // Add metadata if available
                    if (pgsMetadata[trait.pgs_id] && !breakdown.metadata) {
                        breakdown.metadata = pgsMetadata[trait.pgs_id];
                    }
                }
            }
            
            // Clear chunk data immediately
            chunkData.length = 0;
            
            // Yield control to prevent blocking
            if (chunkNum % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        progressCallback?.('Finalizing...', 95);
        
        // Clean up trait table
        await this.query('DROP TABLE IF EXISTS trait_data');
        
        Debug.log(2, 'DuckDB', 'PGS breakdown:', Object.fromEntries(pgsBreakdown));
        
        // Clear references for GC
        rsidMap.clear();
        posMap.clear();
        
        // Final memory cleanup
        await MemoryMonitor.forceGarbageCollection();
        MemoryMonitor.logMemoryUsage('Risk calculation complete');
        
        Debug.log(1, 'DuckDB', 'Risk score calculated:', riskScore);
        progressCallback?.('Complete', 100);
        return { riskScore, pgsBreakdown: Object.fromEntries(pgsBreakdown), pgsDetails: Object.fromEntries(pgsDetails) };
    }
}