# Asili: The local DNA Research Tool

## Infrastructure Setup

This setup orchestrates a Client-Side Data Lakehouse architecture. It is designed to query massive genomic datasets (via Parquet) entirely within the user's browser using DuckDB WASM. This ensures zero-knowledge privacy for user DNA data while minimizing server bandwidth via HTTP Range Requests.

## Application Directory Structure

Files should be organized as follows:

```
/asili
  ├── docker-compose.yml
  ├── README.md
  ├── packages/pipeline/
  │   ├── Dockerfile
  │   └── etl_job.py
  ├── cdn/
  │   └── nginx.conf
  └── apps/web/
      ├── Dockerfile
      ├── server.js
      ├── components/
      └── (Web Components)
```

## Setup Instructions

```bash
# Start the webapp
docker compose up -d

# Run the pipeline
docker compose run --rm pipeline pnpm run etl
```

Webapp: <http://localhost:4242>

Connecting DuckDB (In your Web Components App)

When writing your frontend code, you can now query the data like this:

```javascript
import * as duckdb from '@duckdb/duckdb-wasm';

// Initialize DuckDB with local bundles
const bundle = {
  mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
  mainWorker:
    '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
  pthreadWorker:
    '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js'
};

const worker = new Worker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

// The URL points to your local Docker CDN
const parquetUrl = 'http://localhost:4343/data/Alzheimers_Risk_hg38.parquet';

// DuckDB performs a Range Request to this URL
await conn.query(`
  SELECT count(*) FROM '${parquetUrl}'
  WHERE effect_weight > 0.5
`);
```
