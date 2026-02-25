# Trait Catalog Database Architecture

## Overview

The trait catalog has been refactored from a monolithic JSON file to a normalized DuckDB database with a minimal JSON catalog for trait descriptions. This separates concerns: the JSON file stores only human-readable trait metadata, while the database stores all PGS metadata, performance metrics, and associations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ trait_catalog.json (Git-tracked, minimal)                   │
│ - Trait IDs, titles, descriptions only                      │
│ - No PGS metadata (moved to DB)                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ trait_manifest.db (DuckDB, data_out/, gitignored)           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ traits                                                │  │
│  │ - trait_id (PK)                                       │  │
│  │ - name, description, categories                       │  │
│  │ - expected_variants, estimated_unique_variants        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ pgs_scores (centralized, deduplicated)               │  │
│  │ - pgs_id (PK)                                         │  │
│  │ - weight_type, method_name                            │  │
│  │ - norm_mean, norm_sd, variants_count                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ pgs_performance (one row per metric)                  │  │
│  │ - id (PK, auto-increment)                             │  │
│  │ - pgs_id, metric_type, metric_value                   │  │
│  │ - ci_lower, ci_upper, sample_size, ancestry           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ trait_pgs (many-to-many)                              │  │
│  │ - trait_id, pgs_id (composite PK)                     │  │
│  │ - performance_weight                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ trait_excluded_pgs                                    │  │
│  │ - trait_id, pgs_id (composite PK)                     │  │
│  │ - reason, method, weight_type                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### traits
Core trait information from PGS Catalog.

```sql
CREATE TABLE traits (
  trait_id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description VARCHAR,
  categories VARCHAR,
  expected_variants BIGINT,
  estimated_unique_variants BIGINT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### pgs_scores
Centralized PGS metadata. Each PGS appears once, shared across multiple traits.

```sql
CREATE TABLE pgs_scores (
  pgs_id VARCHAR PRIMARY KEY,
  weight_type VARCHAR,
  method_name VARCHAR,
  norm_mean DOUBLE,
  norm_sd DOUBLE,
  variants_count BIGINT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### pgs_performance
Performance metrics from validation studies. Multiple rows per PGS (one per metric).

```sql
CREATE TABLE pgs_performance (
  id INTEGER PRIMARY KEY,
  pgs_id VARCHAR NOT NULL,
  metric_type VARCHAR NOT NULL,
  metric_value DOUBLE NOT NULL,
  ci_lower DOUBLE,
  ci_upper DOUBLE,
  sample_size BIGINT,
  ancestry VARCHAR
);
```

### trait_pgs
Many-to-many association between traits and PGS scores.

```sql
CREATE TABLE trait_pgs (
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  performance_weight DOUBLE DEFAULT 0.5,
  PRIMARY KEY (trait_id, pgs_id)
);
```

### trait_excluded_pgs
PGS scores excluded from a trait with reasons.

```sql
CREATE TABLE trait_excluded_pgs (
  trait_id VARCHAR NOT NULL,
  pgs_id VARCHAR NOT NULL,
  reason VARCHAR NOT NULL,
  method VARCHAR,
  weight_type VARCHAR,
  PRIMARY KEY (trait_id, pgs_id)
);
```

## Data Flow

### Adding a Trait

```
manage-traits.js add MONDO:0005575
  │
  ├─> Fetch trait info from PGS Catalog API
  ├─> Fetch all associated PGS IDs
  │
  ├─> For each PGS:
  │   ├─> Fetch PGS metadata
  │   ├─> Fetch performance metrics
  │   ├─> Run shouldExcludePGS() filter
  │   ├─> Calculate weight stats
  │   │
  │   ├─> If included:
  │   │   ├─> pgsDB.upsertPGS() → pgs_scores
  │   │   ├─> pgsDB.upsertPerformanceMetrics() → pgs_performance
  │   │   └─> traitDB.addTraitPGS() → trait_pgs
  │   │
  │   └─> If excluded:
  │       └─> traitDB.addExcludedPGS() → trait_excluded_pgs
  │
  ├─> traitDB.upsertTrait() → traits
  ├─> Save minimal JSON to trait_catalog.json
  └─> generateSimplifiedCatalog() → regenerate JSON from DB
```

### Querying Metadata (API Endpoint)

```
GET /api/risk-score/:individualId/:traitId
  │
  ├─> Query traits table for trait info
  ├─> Query trait_pgs for associated PGS IDs
  │
  ├─> For each PGS:
  │   ├─> Query pgs_scores for metadata
  │   └─> Query pgs_performance for best metric
  │
  └─> Return enriched JSON with all metadata
```

## Benefits

### 1. Deduplication
- PGS metadata stored once, referenced by multiple traits
- Before: PGS000146 duplicated across 5 traits = 5× storage
- After: PGS000146 stored once, referenced 5 times

### 2. Efficient Queries
- Get all PGS for a trait: `SELECT * FROM trait_pgs WHERE trait_id = ?`
- Get PGS by performance: `SELECT * FROM trait_pgs WHERE performance_weight > 0.7`
- Get best metric: `SELECT * FROM pgs_performance WHERE pgs_id = ? ORDER BY metric_value DESC`

### 3. Git-Friendly
- trait_catalog.json is minimal (trait IDs + descriptions only)
- No large JSON diffs when PGS metadata changes
- Database is gitignored, regenerated from API

### 4. Normalized Data
- No JSON columns with nested arrays
- Proper relational structure
- Easy to query and join

### 5. Performance Metrics Integration
- All validation metrics stored in structured format
- Easy to query best metric per PGS
- Supports quality-based weighting

## Files

### Core Database Modules
- `lib/pgs-db.js` - PGS metadata and performance metrics
- `lib/trait-db.js` - Trait metadata and associations
- `lib/generate-catalog.js` - Generate simplified JSON from DB

### Management Scripts
- `manage-traits.js` - Add/refresh traits (writes to DB)
- `migrate-catalog-to-db.js` - One-time migration from old JSON format

### API Integration
- `apps/web/lib/metadata-api.js` - Serves metadata from DB
- `apps/web/simple-server.js` - Mounts API endpoint

### Schema
- `migrations/000_create_traits.sql` - Database schema definition
- `trait-catalog-schema-v2.json` - JSON schema for simplified catalog

## Usage

### Initialize Database
```bash
cd packages/pipeline
node manage-traits.js refresh
```

### Add Trait
```bash
node manage-traits.js add MONDO:0005575
```

### Query Database
```bash
duckdb data_out/trait_manifest.db
```

```sql
-- Get all PGS for a trait
SELECT p.pgs_id, p.weight_type, p.method_name, tp.performance_weight
FROM trait_pgs tp
JOIN pgs_scores p ON tp.pgs_id = p.pgs_id
WHERE tp.trait_id = 'MONDO:0005575';

-- Get best metric for each PGS
SELECT pgs_id, metric_type, metric_value, sample_size, ancestry
FROM pgs_performance
WHERE pgs_id IN (SELECT pgs_id FROM trait_pgs WHERE trait_id = 'MONDO:0005575')
ORDER BY metric_value DESC;

-- Count unique PGS across all traits
SELECT COUNT(DISTINCT pgs_id) FROM pgs_scores;

-- Count PGS per trait
SELECT trait_id, COUNT(*) as pgs_count
FROM trait_pgs
GROUP BY trait_id;
```

## Migration

Old format (trait_catalog.json):
```json
{
  "traits": {
    "MONDO:0005575": {
      "trait_id": "MONDO:0005575",
      "title": "Colorectal cancer",
      "pgs_ids": ["PGS000146", "PGS000147"],
      "pgs_metadata": [
        {
          "id": "PGS000146",
          "norm_mean": 0.123,
          "performance_metrics": { ... }
        }
      ]
    }
  }
}
```

New format (trait_catalog.json):
```json
{
  "traits": {
    "MONDO:0005575": {
      "trait_id": "MONDO:0005575",
      "title": "Colorectal cancer",
      "description": "A malignant neoplasm..."
    }
  }
}
```

All PGS metadata now in `trait_manifest.db`.

## Future Enhancements

1. **Caching Layer**: Add Redis/in-memory cache for hot queries
2. **Versioning**: Track PGS metadata versions over time
3. **Audit Log**: Record when traits/PGS are added/updated
4. **Batch Queries**: Optimize multi-trait queries with JOINs
5. **Export**: Generate static JSON snapshots for offline use
