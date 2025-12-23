# Asili: The local DNA Research Tool

## Infrastructure Setup
This setup orchestrates a Client-Side Data Lakehouse architecture. It is designed to query massive genomic datasets (via Parquet) entirely within the user's browser using DuckDB WASM. This ensures zero-knowledge privacy for user DNA data while minimizing server bandwidth via HTTP Range Requests.

## Application Directory Structure

Files should be organized as follows:
```
/asili
  ├── docker-compose.yml
  ├── README.md
  ├── pipeline/
  │   ├── Dockerfile
  │   └── etl_job.py
  ├── cdn/
  │   └── nginx.conf
  └── webapp/
      ├── Dockerfile
      ├── vite.config.js
      └── (Your React Source Code)
```


## Setup Instructions
`docker compose up`

Pipeline: The pipeline container will start, generate mock Parquet files ("Trait Packs") in data_out/, and then exit.

CDN: The cdn container will start serving these files at http://localhost:4343/data/.

Webapp: The webapp will start at http://localhost:4242.

Connecting DuckDB (In your React App)

When writing your frontend code, you can now query the data like this:

```
import * as duckdb from '@duckdb/duckdb-wasm';

// ... init duckdb (requires loading bundles and worker instantiation) ...
// See: [https://duckdb.org/docs/api/wasm/overview](https://duckdb.org/docs/api/wasm/overview)

// The URL points to your local Docker CDN
const parquetUrl = 'http://localhost:4343/data/Alzheimers_Risk_hg38.parquet';

// DuckDB performs a Range Request to this URL
await conn.query(`
  SELECT count(*) FROM '${parquetUrl}'
  WHERE effect_weight > 0.5
`);
```
