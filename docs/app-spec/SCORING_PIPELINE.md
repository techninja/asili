# Scoring Pipeline

The complete algorithm for computing a polygenic risk score result from user DNA and a trait pack. This is the proven flow validated across 3 individuals × 647 traits. Any implementation (browser or server) MUST follow this sequence.

---

## Overview

```
Input:  User DNA variants + Trait parquet (multiple PGS)
Output: Trait-level result (z-score, percentile, best PGS, confidence)
```

The pipeline scores each PGS independently, then selects the best one as the trait result.

---

## Step 1: Load DNA

### Browser (GenotypedDNASource)

Parse user's DNA file into an in-memory Map keyed by `chr:pos`:

```
Map<"chr:pos", { rsid, chromosome, position, allele1, allele2 }>
```

Coverage: ~2-5% of PGS variants (consumer arrays have ~700K SNPs, PGS may need millions).

### Browser with Imputed Data (UnifiedDNASource via DuckDB WASM)

Load the unified parquet (from IndexedDB blob) into DuckDB WASM as a table:

```sql
CREATE TABLE _dna AS SELECT chr, pos, allele_key, variant_id, genotype_dosage, imputed, imputation_quality FROM '{parquet}'
```

Coverage: ~60-80% of PGS variants.

### Server (UnifiedDNASource via DuckDB native)

Same as browser imputed path but using native DuckDB (10x faster).

---

## Step 2: Match Variants

### SQL Pushdown Path (UnifiedDNASource)

Single JOIN materializes all matches for all PGS in the trait:

```sql
CREATE TEMP TABLE _matched AS
SELECT t.pgs_id, t.chr, t.effect_weight,
       d.genotype_dosage AS dosage, d.imputed,
       t.effect_weight * d.genotype_dosage
         * CASE WHEN d.imputed AND d.imputation_quality IS NOT NULL
                THEN SQRT(d.imputation_quality) ELSE 1.0 END
         AS contribution
FROM '{trait_parquet}' t
INNER JOIN _dna d ON t.chr = d.chr AND t.pos = d.pos AND t.allele_key = d.allele_key
```

**Key**: The `allele_key` JOIN prevents spurious matches at multiallelic sites. See `docs/ALLELE_KEY.md`.

**Imputation quality scaling**: Imputed variants are downweighted by `√(quality)` where quality is the max genotype posterior probability. A variant with GP=0.6 contributes `√0.6) ≈ 0.77×` its full weight.

### In-Memory Path (GenotypedDNASource)

For each PGS variant in the trait parquet (read in chunks via DuckDB):

1. Extract `chr:pos` from `variant_id`
2. Look up in the DNA position Map
3. If found, count effect alleles: `countEffectAlleles(allele1, allele2, effect_allele)` → 0, 1, or 2
4. If dosage > 0, emit match with `dosage` and `imputed=false`

---

## Step 3: Aggregate Per PGS

For each PGS, accumulate from matched variants:

| Accumulator          | Formula                                    |
| -------------------- | ------------------------------------------ |
| `raw_score`          | `Σ(contribution)`                          |
| `matched_variants`   | count of matches                           |
| `genotyped_variants` | count where `imputed=false`                |
| `imputed_variants`   | count where `imputed=true`                 |
| `positive_count`     | count where `contribution > 0`             |
| `positive_sum`       | `Σ(contribution)` where `contribution > 0` |
| `negative_count`     | count where `contribution < 0`             |
| `negative_sum`       | `Σ(contribution)` where `contribution < 0` |
| `weight_sum_squared` | `Σ(effect_weight²)`                        |

---

## Step 4: Normalize (Z-Score)

For each PGS, compute z-score using population statistics.

### Normalization Source Selection

```
Has norm_mean/norm_sd in manifest (from TOPMed refstats)?
├── YES: Coverage ≥ 5%?
│   ├── YES: |naive_z| > 20 AND coverage < 80%?
│   │   ├── YES → Incompatible stats → use theoretical
│   │   └── NO  → Use empirical (norm_mean, norm_sd) unscaled
│   └── NO  → Use theoretical
└── NO → Use theoretical
```

### Empirical Normalization

```
z = (raw_score - norm_mean) / norm_sd
```

**Critical**: Never scale mean/SD by coverage. The TOPMed stats describe the full-PGS distribution. Coverage affects confidence (quality score), not the z-score.

### Theoretical Fallback

When no empirical stats are available:

```
mean = 0
sd = √(weight_sum_squared × 0.5)
z = raw_score / sd
```

This assumes `af=0.5` for all variants — less accurate but safe (can't produce extreme z-scores).

### Percentile

```
percentile = Φ(z) × 100
```

Where `Φ` is the standard normal CDF, implemented via the error function approximation.

---

## Step 5: Quality Score

Ranks PGS by combining scientific validity, data quality, and informativeness. See `docs/PGS_QUALITY_SCORE.md` for full formula.

```
Quality = R² × 35 × CoveragePenalty
        + ValidationBonus × 15
        + GenotypedRatio × 15
        + Coverage × 10
        + log₁₀(matched/8) × 10
        + Normalization × 5
        + Signal × 10
```

Key behaviors:

- PGS with validated R² (from `pgs_performance` table) get a bonus over default R²=0.05
- PGS with |z| > 5 get 0 signal points (likely bad normalization)
- Minimum 8 matched variants required (`insufficientData` flag)

---

## Step 6: Select Best PGS

```
For each PGS (sorted by quality score descending):
  Skip if insufficientData
  Skip if |z| > 5 (incompatible normalization)
  → First remaining PGS is the best

Fallback: if ALL PGS are excluded, pick highest quality score with non-null z
```

The trait-level result inherits the best PGS's z-score, percentile, and confidence.

---

## Step 7: Quantitative Value (optional)

For traits with `trait_type = "quantitative"` and known `phenotype_mean`/`phenotype_sd`:

```
value = phenotype_mean + z_score × √(R²) × phenotype_sd
```

Where R² is the best PGS's validated performance metric. This converts the z-score back to the trait's natural units (e.g., kg/m² for BMI).

---

## Step 8: Store Result

The complete result object (see `docs/DATA_CONTRACTS.md` for schema) is stored:

- **Browser**: IndexedDB, keyed by `{individualId}:{traitId}`
- **Server**: `risk_scores.db` DuckDB file, `trait_results` + `pgs_results` tables

---

## Performance Characteristics

| Metric           | Browser (genotyped)           | Browser (imputed) | Server (imputed)   |
| ---------------- | ----------------------------- | ----------------- | ------------------ |
| Variant matching | Map lookup, ~5K matches/trait | DuckDB WASM JOIN  | DuckDB native JOIN |
| Single trait     | 1-3s                          | 2-5s              | 0.5-2s             |
| 44 traits        | 1-2 min                       | 2-4 min           | 30-60s             |
| Memory           | ~100MB                        | ~300MB            | ~500MB             |
| Coverage         | 2-5%                          | 60-80%            | 60-80%             |

### Browser Threading

All scoring runs in a Web Worker to keep the UI responsive. DuckDB WASM is single-connection, so traits are scored sequentially within the worker. The main thread receives progress updates and completed results via `postMessage`.

---

## Coverage and Confidence

The app should communicate data quality to the user:

| Coverage | Confidence   | User Message                                             |
| -------- | ------------ | -------------------------------------------------------- |
| ≥50%     | High         | Result shown normally                                    |
| 20-50%   | Medium       | "Based on partial genetic data"                          |
| 5-20%    | Low          | "Limited data — consider imputation for better accuracy" |
| <5%      | Insufficient | "Not enough data to score reliably"                      |
| 0%       | None         | Trait card shows "No data" state                         |

### Imputation Upsell (Public app)

When a user has only genotyped data (2-5% coverage), the app should:

1. Show results with appropriate confidence badges
2. Display a banner: "Your DNA covers X% of variants. Unlock 60-80% coverage with imputation →"
3. Link to the cloud imputation service (when available) or self-hosted instructions

---

## Allele Matching

All JOINs use `chr + pos + allele_key` (three integers). The `allele_key` is a deterministic hash pre-computed in both parquet schemas:

```sql
('0x' || md5(LEAST(a3, a4) || ':' || GREATEST(a3, a4))[:15])::BIGINT
```

This handles:

- **Allele flips**: `A:G` and `G:A` produce the same key
- **Multiallelic sites**: Only the matching allele pair joins, not all alleles at that position
- **Cross-runtime consistency**: Same value from CLI DuckDB, Node DuckDB, and Python DuckDB

For the browser genotyped-only path (no DuckDB JOIN), allele matching uses `countEffectAlleles(allele1, allele2, effectAllele)` which returns 0 for non-matching alleles.

---

## What the App Does NOT Implement

The app consumes results from the scoring pipeline. It does NOT:

- Compute `allele_key` — pre-computed in parquet files
- Run the ETL pipeline — packs are pre-built and served via CDN
- Run imputation — handled by cloud service or local Docker
- Compute TOPMed refstats — pre-computed and stored in manifest
- Validate PGS quality — `pgs_performance` data is pre-loaded in manifest DB

The app's job is: load manifest → load DNA → score traits → display results.
