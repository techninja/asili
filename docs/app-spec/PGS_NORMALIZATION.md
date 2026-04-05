# PGS Score Normalization

## Problem

Different PGS scores use different weight scales — raw phenotype units, standardized betas, log-odds. A raw sum is not comparable across PGS or interpretable on its own.

**Z-score normalization** converts each PGS raw score to standard deviations from the population mean:

```
z = (raw_score - mean) / sd
```

## How Mean/SD Are Computed

The theoretical distribution under Hardy-Weinberg equilibrium:

```
E[PGS] = Σ(w_i × 2 × af_i)
SD[PGS] = √Σ(w_i² × 2 × af_i × (1 - af_i))
```

Where `w_i` is the effect weight and `af_i` is the allele frequency for each variant.

### Allele Frequency Source: TOPMed

We use allele frequencies from the **TOPMed imputation reference panel** (~70M variants across 22 autosomes). This is the same panel used for user DNA imputation, ensuring coordinate and variant ID consistency.

The AF extraction is cached at `cache/topmed_reference/allele_frequencies.tsv` after first run.

### Coverage Tiers

Not all PGS variants exist in TOPMed. The normalization quality depends on how many variants matched:

| TOPMed AF Coverage | Treatment                                                     | Count      |
| ------------------ | ------------------------------------------------------------- | ---------- |
| ≥80%               | **Empirical** — mean/SD from real AFs, stored in manifest     | ~4,503 PGS |
| 5-80%              | **Partial** — mean/SD from matched subset, stored in manifest | ~625 PGS   |
| <5%                | **NULL** — left empty, calculator uses theoretical fallback   | ~28 PGS    |

The <5% threshold exists because computing mean/SD from a tiny fraction of variants produces stats that describe a completely different distribution than what gets scored. A PGS with 0.3% AF coverage and `sd=0.00005` would produce z-scores in the thousands.

### Calculator Fallback

When `norm_mean`/`norm_sd` are NULL in the manifest, the scoring calculator (`calculator.js`) estimates SD from the actual matched weights:

```
sd = √(Σ(w_i²) × 0.5)    // assumes af=0.5 for all variants
mean = 0
```

This is less accurate than real AFs but safe — it can't produce extreme z-scores because the SD scales with the same weights that produce the raw score.

## Pipeline

### Step 1: Extract TOPMed AF

```bash
# Automatic on first run of refstats
# Cached at cache/topmed_reference/allele_frequencies.tsv
bcftools query -f '%CHROM:%POS:%REF:%ALT\t%AF\n' chr{1..22}.topmed.vcf.gz
```

### Step 2: Compute per-PGS stats

```bash
pnpm pgs refstats batch
```

Joins each trait pack's variants against the TOPMed AF table in DuckDB, computes mean/SD per PGS, writes to `data_out/pgs_topmed_stats.json`, then imports to `trait_manifest.db`.

### Step 3: Reset and recompute

```bash
pnpm pgs refstats reset   # Clear all norm_mean/norm_sd
pnpm pgs refstats batch   # Recompute from TOPMed AF
```

## Coordinate System

PGS scoring files from the PGS Catalog come in mixed genome builds (75% GRCh37, 11% GRCh38, 7% other). The ETL pipeline uses **harmonized GRCh38 files** from the PGS Catalog (`_hmPOS_GRCh38.txt.gz`) which provide `hm_chr`/`hm_pos` columns with lifted-over coordinates.

The format detection in `harmonization.js` prioritizes `hm_chr`/`hm_pos` over `chr_position` to ensure all pack parquets contain hg38 coordinates matching the TOPMed panel and user imputed data.

## >5σ Exclusion

PGS with |z| > 5 are excluded from the weighted trait-level z-score aggregation. A z-score beyond 5σ almost always indicates incompatible normalization (partial AF coverage, wrong variant set) rather than genuine extreme genetic risk. These scores are still stored per-PGS for transparency but don't affect the user-facing trait percentile.

## Files

| File                                                | Purpose                                                 |
| --------------------------------------------------- | ------------------------------------------------------- |
| `scripts/calc-pgs-refstats.js`                      | Orchestrator — reset, batch compute, import to manifest |
| `scripts/calc-pgs-refstats-topmed.py`               | Python worker — extracts TOPMed AF, joins against packs |
| `data_out/pgs_topmed_stats.json`                    | Cached per-PGS stats (coverage, mean, SD)               |
| `cache/topmed_reference/allele_frequencies.tsv`     | Cached TOPMed AF (~70M variants)                        |
| `packages/core/src/genomic-processor/calculator.js` | Runtime z-score calculation + theoretical fallback      |
