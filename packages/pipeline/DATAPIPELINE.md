## Alisi Science Data Pipeline & "Trait Packs"

This directory contains the ETL (Extract, Transform, Load) logic responsible for powering the **Local-Only DNA Research Tool**.

Because the user's DNA never leaves their browser, we cannot perform lookups on a backend server. Instead, we must ship the scientific reference data _to_ the browser. To do this efficiently, we transform raw scientific data into highly optimized **"Trait Packs"**.

## 1. Data Strategy: The "Trait Pack"

A **Trait Pack** is a single, self-contained file representing the genetic risk factors for a specific condition (e.g., _Type 1 Diabetes_, _Coronary Artery Disease_, _Height_).

* **Format:** Apache Parquet with unified schema
* **Compression:** ZSTD (Level 3)
* **Access Pattern:** HTTP Range Requests (via DuckDB WASM)

This allows the browser to download _only the headers_ of a 100MB file to see if it's relevant, or query specific ranges without downloading the whole dataset.

## 2. Data Sources & Ingestion

Our primary source of truth is the **PGS Catalog** (Polygenic Score Catalog), an open database of polygenic risk scores.

* **Source URL:** [https://www.pgscatalog.org/](https://www.pgscatalog.org/)
* **Data Type:** Scoring Files (`.txt.gz`) - multiple formats supported
* **Caching:** Downloaded files cached locally to avoid re-downloads
* **Update Frequency:**
  * **Ad-hoc:** When adding new specific traits requested by users
  * **Quarterly:** To update existing scores with better-researched versions

### Data Architecture

**Trait Catalog (`trait_catalog.json`):** Canonical source defining trait families, subtypes, and PGS score mappings

**Output Manifest (`trait_manifest.json`):** Generated file containing both trait definitions and processing metadata

## 3. The Precompute Process (ETL)

The `etl_job.js` script performs format detection, harmonization, and unification to transform multiple PGS formats into standardized Trait Packs.

### Step A: Format Detection & Harmonization

PGS files come in multiple formats. We detect and harmonize them into a unified schema:

**Supported Formats:**
- **Standard SNP:** chr_name + chr_position based
- **HLA Allele:** rsID + is_haplotype based  
- **rsID Only:** rsID without positions
- **rsID + Chr:** rsID + chr_name without positions

**Unified Schema:**
| Column          | Type    | Description                                    |
|-----------------|---------|------------------------------------------------|
| `variant_id`    | String  | Unified identifier (position-based or rsID)   |
| `chr_name`      | String  | Chromosome (1-22, X, Y, MT) - optional        |
| `chr_position`  | Integer | Base pair position (HG38 build) - optional    |
| `effect_allele` | String  | The mutation that causes the effect           |
| `other_allele`  | String  | Reference allele - optional                   |
| `effect_weight` | Float   | Effect weight (Log Odds Ratio or Beta)        |
| `pgs_id`        | String  | Source PGS score identifier                   |
| `format_type`   | String  | Original format type for debugging            |

### Step B: Coordinate System

**Current State:** We process files as-is from PGS Catalog. Most modern scores use **GRCh38 (hg38)** or provide harmonized versions.

**LiftOver Handling:** Files are named with `_hg38.parquet` suffix. If source data requires coordinate conversion, this should be handled during harmonization.

### Step C: Optimization

DuckDB performs efficient joins when data is properly structured:
* **Multiple matching strategies:** Position-based and rsID-based matching
* **Chunked processing:** 50K variants per chunk to manage memory
* **Minimum thresholds:** 100+ variants required for valid files

## 4. Output & Deployment

1. **Generation:** Pipeline writes to `/output` (mapped to `./data_out` on host)
2. **Naming:** `{trait_family}_{subtype}_hg38.parquet`
3. **Manifest:** `trait_manifest.json` contains metadata and file references
4. **Serving:** CDN container serves files via Nginx with range request support

## 5. How to Run

To run the pipeline and regenerate Trait Packs:

```bash
# From project root
docker-compose up --build pipeline
```

The container will:
1. Load trait catalog definitions
2. Check for existing files and validate against PGS API
3. Download and cache PGS files as needed
4. Process and harmonize multiple formats into unified parquet files
5. Update manifest with metadata and file references
6. Exit automatically
