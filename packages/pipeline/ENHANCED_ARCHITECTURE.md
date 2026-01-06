# Enhanced Trait Catalog Architecture

## Overview

The enhanced trait catalog groups related polygenic scores into **trait families** to provide comprehensive risk assessments and prevent duplicate trait names.

## Schema Structure

### Trait Families

Each family represents a related group of traits (e.g., diabetes, cardiovascular):

```json
{
  "trait_families": {
    "diabetes": {
      "name": "Diabetes Risk Profile",
      "description": "Comprehensive diabetes and glucose metabolism risk assessment",
      "category": "metabolic",
      "subtypes": { ... },
      "biomarkers": { ... }
    }
  }
}
```

### Subtypes

Primary risk scores for the trait family:

```json
"subtypes": {
  "type2": {
    "name": "Type 2 Diabetes Risk",
    "pgs_id": "PGS000014",
    "description": "Genetic predisposition to type 2 diabetes mellitus",
    "variant_count": 12345,
    "url": "https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/PGS000014/ScoringFiles/PGS000014.txt.gz",
    "file": "Type_2_Diabetes_hg38.parquet",
    "weight": 0.6,
    "last_updated": "2025-12-24T00:56:49.244Z"
  }
}
```

### Biomarkers

Supporting measurements that inform the trait family:

```json
"biomarkers": {
  "insulin": {
    "name": "BMI-adjusted fasting blood insulin measurement",
    "pgs_id": "PGS005277",
    "file": "BMI_adjusted_fasting_blood_insulin_measurement_hg38.parquet",
    "last_updated": "2025-12-24T00:55:21.857Z"
  }
}
```

## Data Pipeline Changes

### ETL Process

- Reads `trait_catalog_enhanced.json`
- Processes both subtypes and biomarkers
- Adds source tracking columns:
  - `source_family`: Which trait family (diabetes, cardiovascular, etc.)
  - `source_type`: subtype or biomarker
  - `source_pgs_id`: Original PGS ID
  - `source_weight`: Relative importance in family

### Output Files

Each parquet file now includes DNA coverage tracking:

- Original variant data
- Source family information
- PGS ID for traceability
- Weight for composite scoring

## Frontend Integration

### DuckDB Queries

Updated queries can now:

1. **Group by family**: `SELECT * FROM variants WHERE source_family = 'diabetes'`
2. **Filter by type**: `SELECT * FROM variants WHERE source_type = 'subtype'`
3. **Calculate coverage**: `SELECT source_pgs_id, COUNT(*) as variant_count FROM variants GROUP BY source_pgs_id`
4. **Weighted scoring**: `SELECT SUM(effect_weight * source_weight) FROM variants WHERE source_family = 'diabetes'`

### Coverage Display

Frontend can show DNA coverage per PGS source:

- "Your DNA covers 85% of diabetes risk variants (PGS000014)"
- "Additional coverage from insulin biomarkers (PGS005277)"

## Benefits

1. **No duplicate names**: Related traits grouped logically
2. **Comprehensive assessment**: Multiple PGS scores per condition
3. **DNA coverage transparency**: Users see which datasets inform their risk
4. **Weighted scoring**: More accurate risk calculations
5. **Extensible**: Easy to add new families and subtypes

## Migration

Existing trait files remain compatible. The enhanced catalog provides:

- Backward compatibility with old queries
- Additional metadata for improved analysis
- Clear upgrade path for comprehensive risk profiles
