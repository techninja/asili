# Alisi Science Data Pipeline & "Trait Packs"

This directory contains the ETL (Extract, Transform, Load) logic responsible for powering the Local-Only DNA Research Tool.

Because the user's DNA never leaves their browser, we cannot perform lookups on a backend server. Instead, we must ship the scientific reference data to the browser. To do this efficiently, we transform raw scientific data into highly optimized "Trait Packs".

1. Data Strategy: The "Trait Pack"

A Trait Pack is a single, self-contained file representing the genetic risk factors for a specific condition (e.g., Alzheimer's Risk, Caffeine Metabolism, Height).

Format: Apache Parquet

Compression: ZSTD (Level 3)

Access Pattern: HTTP Range Requests (via DuckDB WASM)

This allows the browser to download only the headers of a 100MB file to see if it's relevant, or query specific ranges without downloading the whole dataset.

2. Data Sources & Ingestion

Our primary source of truth is the PGS Catalog (Polygenic Score Catalog), an open database of polygenic risk scores.

Source URL: https://www.pgscatalog.org/

Data Type: Scoring Files (.txt.gz)

Update Frequency: * Ad-hoc: When adding new specific traits requested by users.

Quarterly: To update existing scores with better-researched versions (e.g., upgrading a score from 2018 to a 2024 study).

Raw Data Location

Raw input files (downloaded from PGS Catalog) should be placed in a local data_in/ directory (not currently committed) or fetched dynamically by the scripts.

3. The Precompute Process (ETL)

The etl_job.py script performs four critical operations to transform raw CSV/TXT data into a usable Trait Pack.

Step A: Harmonization

Raw scientific data is messy. We normalize column names to a strict schema to ensure the frontend code is generic.

| Target Column | Data Type |                           Description                           |
|:-------------:|:---------:|:---------------------------------------------------------------:|
| chr_name      | String    | Chromosome (1-22, X, Y, MT). Normalized to remove 'chr' prefix. |
| chr_position  | Integer   | Base pair position (HG38 build).                                |
| effect_allele | String    | The specific mutation (A, T, C, or G) that causes the effect.   |
| other_allele  | String    | The reference or non-effect allele.                             |
| effect_weight | Float     | The weight of the effect (Log Odds Ratio or Beta).              |

Step B: LiftOver (Future/Planned)

Current State: We assume input data is GRCh38 (hg38).
Requirement: If source data is hg19, we must perform a "LiftOver" to remap coordinates to hg38, as most consumer DNA files (23andMe v5, Ancestry) are easily mapped to this standard.

Step C: Sorting (CRITICAL)

DuckDB can perform a Merge Join (O(n)) instead of a Hash Join (O(n*m)) if both the user's DNA and the Trait Pack are sorted by the same keys.

Sort Key: chr_name (Ascending) -> chr_position (Ascending).

Note: chr_name is sorted "naturally" (1, 2, ... 10), not lexicographically (1, 10, 2).

Step D: Parquet Optimization

We write the dataframe to Parquet with specific settings for HTTP performance:

Compression: ZSTD (High compression ratio, fast decompression in WASM).

Row Groups: Standard size (optimizes the "seek" capability of range requests).

4. Output & Deployment

Generation: The pipeline writes files to /output (mapped to ./data_out on host).

Naming Convention: {Trait_Name}_{Build}.parquet (e.g., Alzheimers_Risk_hg38.parquet).

Serving: The cdn container mounts this directory and serves it via Nginx.

5. How to Run

To run the pipeline and regenerate all Trait Packs:

# From project root
docker-compose up --build pipeline


The container will:

Spin up.

Execute etl_job.py.

Write new Parquet files
