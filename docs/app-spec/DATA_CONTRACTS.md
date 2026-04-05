# Data Contracts

Definitive schemas for all data exchanged between the pipeline, storage, and application layers. Any code that reads or writes these formats MUST conform to these contracts.

---

## Parquet Schemas

### Trait Pack (`data_out/packs/{trait_id}_hg38.parquet`)

One file per trait. Contains all PGS variants for that trait, pre-joined and ready for scoring.

| Column          | Type    | Description                                                         |
| --------------- | ------- | ------------------------------------------------------------------- |
| `variant_id`    | VARCHAR | `chr:pos:alleleA:alleleB` (4-part, always present)                  |
| `effect_allele` | VARCHAR | The allele whose count drives the score                             |
| `effect_weight` | DOUBLE  | PGS weight for this variant                                         |
| `pgs_id`        | VARCHAR | PGS identifier (e.g., `PGS000027`)                                  |
| `chr`           | TINYINT | Chromosome (1-22, 23=X, 24=Y, 25=MT)                                |
| `pos`           | INTEGER | GRCh38 position                                                     |
| `allele_key`    | BIGINT  | Deterministic hash of sorted allele pair (see `docs/ALLELE_KEY.md`) |

**Sort order**: `chr, pos, allele_key`
**Compression**: ZSTD
**Produced by**: ETL pipeline (`processor-core.js`, `batched-processor.js`)
**Consumed by**: Scoring engine (browser DuckDB WASM or server DuckDB native)

### Unified DNA (`server-data/unified/{individual_id}.parquet`)

One file per individual. Genotyped + imputed variants merged, genotyped taking precedence at shared positions.

| Column               | Type    | Description                                             |
| -------------------- | ------- | ------------------------------------------------------- |
| `variant_id`         | VARCHAR | `chr:pos:ref:alt` (4-part)                              |
| `genotype_dosage`    | FLOAT   | 0.0-2.0 (integer for genotyped, continuous for imputed) |
| `imputed`            | BOOLEAN | `true` if from Beagle imputation                        |
| `imputation_quality` | FLOAT   | Max genotype posterior probability (0.5-1.0)            |
| `chr`                | TINYINT | Chromosome                                              |
| `pos`                | INTEGER | GRCh38 position                                         |
| `allele_key`         | BIGINT  | Deterministic hash of sorted allele pair                |

**Sort order**: `chr, pos`
**Compression**: ZSTD
**Produced by**: Imputation pipeline (`impute_user.py`, `rebuild-unified.py`)
**Consumed by**: Scoring engine

### Scoring JOIN

The canonical JOIN between trait pack and DNA:

```sql
FROM trait_pack t
INNER JOIN dna d ON t.chr = d.chr AND t.pos = d.pos AND t.allele_key = d.allele_key
```

Three integer columns. No string parsing at query time.

---

## Trait Manifest (`data_out/trait_manifest.json`)

Filtered by tier at build time. The app loads this on startup to know what traits are available.

```json
{
  "version": "1.0",
  "generated_at": "2026-03-29T...",
  "traits": {
    "{trait_id}": {
      "trait_id": "EFO_0004340",
      "name": "body mass index",
      "description": "A measure of body fat based on height and weight.",
      "emoji": "⚖️",
      "trait_type": "quantitative | disease_risk",
      "unit": "kg/m² | null",
      "phenotype_mean": 27.4,
      "phenotype_sd": 4.8,
      "reference_population": "UK Biobank | null",
      "categories": ["Body"],
      "expected_variants": 1234567,
      "pgs_count": 45,
      "file_path": "packs/EFO_0004340_hg38.parquet"
    }
  }
}
```

**Produced by**: `export-manifest.js` (reads from `trait_manifest.db`, filters by tier allowlist)
**Consumed by**: App on startup (fetched via HTTP, cached in memory)

---

## Risk Score Result

Stored per individual + trait. In browser: IndexedDB. On server: `risk_scores.db` (DuckDB).

### Trait-Level Result

The user-facing result for one trait.

```json
{
  "zScore": 1.23,
  "percentile": 89.1,
  "confidence": "high | medium | low | insufficient | none",
  "bestPGS": "PGS000027",
  "bestPGSPerformance": 0.13,
  "bestPGSQualityScore": 62.4,
  "matchedVariants": 45230,
  "totalVariants": 48000,
  "calculatedAt": "2026-03-29T...",
  "trait_type": "quantitative | disease_risk",
  "unit": "kg/m² | null",
  "value": 28.7,
  "phenotype_mean": 27.4,
  "phenotype_sd": 4.8,
  "reference_population": "UK Biobank | null",
  "pgsDetails": { "...per-PGS detail map..." },
  "pgsBreakdown": { "...per-PGS breakdown map..." }
}
```

### Per-PGS Detail (inside `pgsDetails[pgsId]`)

```json
{
  "score": 0.0234,
  "zScore": 1.45,
  "percentile": 92.6,
  "matchedVariants": 12340,
  "genotypedVariants": 450,
  "imputedVariants": 11890,
  "confidence": "high",
  "insufficientData": false,
  "performanceMetric": 0.13,
  "qualityScore": 62.4,
  "coverage": 0.928,
  "normMean": 0.0012,
  "normSd": 0.0156,
  "topVariants": []
}
```

### Per-PGS Breakdown (inside `pgsBreakdown[pgsId]`)

```json
{
  "positive": 6234,
  "positiveSum": 0.0345,
  "negative": 6106,
  "negativeSum": -0.0111,
  "total": 12340,
  "chromosomeCoverage": { "1": 890, "2": 756, "...": "..." },
  "chrTotals": { "1": 950, "2": 810, "...": "..." },
  "weightBuckets": [],
  "genotypedVariants": 450,
  "imputedVariants": 11890
}
```

---

## Settings (`data_out/settings.json`)

Build-time configuration baked into the deployment.

```json
{
  "tier": 1,
  "version": "1.0.0",
  "build_date": "2026-03-29",
  "data_path": "/data",
  "features": {
    "imputation_upsell": true,
    "export_cache": true,
    "debug_panel": false
  }
}
```

---

## Browser Storage (IndexedDB)

### Stores

| Store         | Key                        | Value                                                                 | Purpose                                         |
| ------------- | -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `individuals` | `{id}`                     | `{ id, name, emoji, relationship, variantCount, status, hasImputed }` | Individual profiles                             |
| `variants`    | `{individualId}`           | `{ variants: [...], metadata: {...} }`                                | Raw parsed DNA variants                         |
| `unified`     | `{individualId}`           | `ArrayBuffer` (parquet bytes)                                         | Imputed unified parquet (post cloud imputation) |
| `results`     | `{individualId}:{traitId}` | Risk score result (see above)                                         | Cached scoring results                          |
| `settings`    | `app`                      | `{ lastIndividual, viewPrefs, ... }`                                  | User preferences                                |

### Storage Budget

| Data                          | Typical Size |
| ----------------------------- | ------------ |
| Genotyped variants (700K)     | ~30MB        |
| Unified parquet (imputed)     | ~20-40MB     |
| All trait results (44 traits) | ~2MB         |
| Total per individual          | ~50-70MB     |

IndexedDB quota is typically 50% of free disk space. Three individuals with imputed data ≈ 200MB — well within limits.

---

## Supported DNA File Formats

| Format           | Detected By                                           | Variants (typical) |
| ---------------- | ----------------------------------------------------- | ------------------ |
| 23andMe v3/v4/v5 | Header `# rsid` or `# This data`                      | 600-700K           |
| AncestryDNA      | Header `rsid\tchromosome\tposition\tallele1\tallele2` | 700K               |
| MyHeritage       | Header contains `RSID,CHROMOSOME`                     | 700K               |
| FamilyTreeDNA    | Tab-separated with `RSID` header                      | 700K               |
| VCF              | Header `##fileformat=VCF`                             | Variable           |

Parser output (uniform across all formats):

```json
{
  "rsid": "rs12345",
  "chromosome": "1",
  "position": 12345,
  "allele1": "A",
  "allele2": "G"
}
```

---

## Normalization Parameters (in `trait_manifest.db`)

### `pgs_scores` table

| Column            | Type       | Description                                                 |
| ----------------- | ---------- | ----------------------------------------------------------- |
| `pgs_id`          | VARCHAR PK | PGS identifier                                              |
| `norm_mean`       | DOUBLE     | TOPMed-derived expected PGS score (NULL if <5% AF coverage) |
| `norm_sd`         | DOUBLE     | TOPMed-derived standard deviation (NULL if <5% AF coverage) |
| `weight_type`     | VARCHAR    | `beta`, `NR`, `log_odds`, etc.                              |
| `method_name`     | VARCHAR    | `LDpred`, `prscs`, `DBSLMM`, etc.                           |
| `variants_number` | INTEGER    | PGS Catalog reported variant count                          |

### `pgs_performance` table

| Column         | Type    | Description                                         |
| -------------- | ------- | --------------------------------------------------- |
| `pgs_id`       | VARCHAR | PGS identifier                                      |
| `metric_type`  | VARCHAR | `R²`, `PGS R2 (no covariates)`, `AUROC`, `OR`, etc. |
| `metric_value` | DOUBLE  | Metric value                                        |
| `ci_lower`     | DOUBLE  | Confidence interval lower bound                     |
| `ci_upper`     | DOUBLE  | Confidence interval upper bound                     |
| `sample_size`  | INTEGER | Validation cohort size                              |
| `ancestry`     | VARCHAR | Validation cohort ancestry                          |

Only `R²` and `PGS R2 (no covariates)` are used for quality scoring. Other metrics are stored for transparency.
