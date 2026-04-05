# Allele Key Hashing

## Problem

PGS scoring JOINs DNA variants against PGS catalog variants using chromosome and position (`chr + pos`). At multiallelic sites — positions where multiple alleles exist — this creates a cross-product: every PGS variant at that position matches every DNA variant at that position, regardless of whether the alleles actually correspond.

This inflated match counts (>100% coverage), corrupted raw scores, and produced nonsensical z-scores.

## Solution

An `allele_key` BIGINT column is stored in both PGS pack parquets and unified DNA parquets. The JOIN becomes `chr + pos + allele_key` — three integers, no string parsing at query time.

## Algorithm

```sql
('0x' || md5(
  LEAST(SPLIT_PART(variant_id, ':', 3), SPLIT_PART(variant_id, ':', 4))
  || ':' ||
  GREATEST(SPLIT_PART(variant_id, ':', 3), SPLIT_PART(variant_id, ':', 4))
)[:15])::BIGINT
```

### Step by step

Given a `variant_id` of `chr:pos:alleleA:alleleB`:

1. **Extract alleles**: `SPLIT_PART(variant_id, ':', 3)` and `SPLIT_PART(variant_id, ':', 4)`
2. **Sort lexicographically**: `LEAST(a, b) || ':' || GREATEST(a, b)` — so `G:T` and `T:G` both become `G:T`
3. **Hash**: `md5(...)` produces a deterministic 32-char hex string
4. **Truncate**: `[:15]` takes the first 15 hex characters (60 bits)
5. **Cast**: `('0x' || ...)::BIGINT` converts to a signed 64-bit integer

### Why this specific approach

- **Sorted allele pair**: PGS files use `effect_allele:other_allele` ordering. DNA files may use `ref:alt` or alphabetical ordering. Sorting ensures both produce the same key regardless of which allele is listed first.
- **md5 not HASH()**: DuckDB's `HASH()` function uses a per-process random seed. Two different DuckDB instances (e.g., the Python ETL pipeline and the Node.js scoring engine) produce different hash values for the same input. `md5()` is deterministic across all runtimes.
- **15 hex chars not 16**: 16 hex characters = 64 bits, which can overflow signed BIGINT (max 2^63 - 1). 15 hex characters = 60 bits, safely within range. Collision probability at 60 bits with 10M variants is ~10^-5, negligible.
- **BIGINT not VARCHAR**: Integer comparison in JOINs is faster than string comparison. The allele_key column compresses well in Parquet (dictionary + RLE encoding on integers).

## Where it's computed

| Stage                | File                                         | When                              |
| -------------------- | -------------------------------------------- | --------------------------------- |
| ETL (direct)         | `packages/pipeline/lib/processor-core.js`    | `createStandardizedExportQuery()` |
| ETL (batched)        | `packages/pipeline/lib/batched-processor.js` | Batch standardization SQL         |
| Imputation (per-chr) | `scripts/impute_user.py`                     | `bcf_to_chr_parquet()`            |
| Imputation (merge)   | `scripts/impute_user.py`                     | `merge_with_genotyped()`          |
| Rebuild utility      | `scripts/rebuild-unified.py`                 | Standalone re-merge               |

## Where it's consumed

| Stage                  | File                                                        | How                       |
| ---------------------- | ----------------------------------------------------------- | ------------------------- |
| Scoring (SQL pushdown) | `packages/core/src/genomic-processor/dna-source/unified.js` | `_runScoreQueries()` JOIN |
| Top variants           | `packages/core/src/genomic-processor/dna-source/unified.js` | `fetchTopVariants()` JOIN |
| Batch matching         | `packages/core/src/genomic-processor/dna-source/unified.js` | `matchVariants()` JOIN    |

## Parquet schema

Both pack and unified parquets include `allele_key` as `INT64`:

```
Pack:    variant_id | effect_allele | effect_weight | pgs_id | chr | pos | allele_key
Unified: variant_id | genotype_dosage | imputed | imputation_quality | chr | pos | allele_key
```

## Validation

After rebuilding packs and unified parquets, run:

```bash
pnpm scores validate
```

The "No PGS with matched > expected variants" check will fail if any allele_key mismatches cause cross-product inflation.
