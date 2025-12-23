import * as duckdb from '@duckdb/duckdb-wasm';

export class DuckDBProvider {
    constructor() {
        this.db = null;
        this.conn = null;
    }

    async init() {
        // Use local bundles instead of CDN to avoid CORS issues
        const bundle = {
            mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
            mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
            pthreadWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js'
        };
        
        const worker = new Worker(bundle.mainWorker);
        const logger = new duckdb.ConsoleLogger();
        
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

    async importDNA(data, tableName = 'user_dna') {
        // Store user DNA in IndexedDB-backed table
        await this.query(`CREATE OR REPLACE TABLE ${tableName} (rsid VARCHAR, chromosome VARCHAR, position INTEGER, genotype VARCHAR)`);
        
        for (const row of data) {
            await this.query(`INSERT INTO ${tableName} VALUES ('${row.rsid}', '${row.chromosome}', ${row.position}, '${row.genotype}')`);
        }
    }

    async calculateRisk(traitUrl, userTable = 'user_dna') {
        await this.loadParquet(traitUrl, 'trait_data');
        
        const result = await this.query(`
            SELECT 
                SUM(td.effect_weight * 
                    CASE 
                        WHEN ud.genotype LIKE '%' || td.risk_allele || '%' THEN 1 
                        ELSE 0 
                    END
                ) as risk_score
            FROM trait_data td
            JOIN ${userTable} ud ON td.rsid = ud.rsid
        `);
        
        return result.toArray()[0].risk_score;
    }
}