# PGS Score Normalization

## Problem

Different PGS scores use different weight scales:
- **snpnet**: Raw phenotype units (e.g., impedance in ohms, BMI units)
- **LDpred2**: Standardized betas (σ units)
- **Effect allele counts**: Integer weights

Combining raw scores from different scales produces meaningless results. For example:
- PGS003904 (body impedance): weights range from -3.91 to 4.27
- PGS003509 (body fat %): weights in small standardized units

A combined score of -134.26 from raw weights is not interpretable.

## Solution

**Z-score normalization**: Convert each PGS raw score to standard deviations from the mean.

Formula: `z = (raw_score - mean) / sd`

This makes all PGS scores comparable:
- z = 0: Average risk
- z = 1: One standard deviation above average
- z = 2: Two standard deviations above average

## Implementation

### 1. Schema Changes

**trait-catalog-schema.json**: PGS IDs can now be objects with normalization parameters:

```json
{
  "pgs_ids": [
    "PGS000001",
    {
      "id": "PGS003904",
      "norm_mean": -5.3934e-4,
      "norm_sd": 1.8580e-1
    }
  ]
}
```

### 2. Pipeline Changes

**packages/pipeline/lib/weight-stats.js**: Calculates weight statistics from PGS files.

**packages/pipeline/manage-traits.js**: 
- Calculates mean and SD for each PGS during trait refresh/add
- Stores normalization params if `|max(weight)| > 1.0`

**packages/pipeline/lib/catalog.js**: Normalizes PGS IDs to objects with `{ id, norm_mean, norm_sd }`

### 3. Core Processing Changes

**packages/core/src/genomic-processor/shared-calculator.js**:
- Constructor accepts `normalizationParams`
- `finalize()` applies z-score normalization per PGS before summing
- Returns both `riskScore` (normalized) and `rawScore`

**packages/core/src/unified-processor.js** & **unified-processor-browser.js**:
- Extracts normalization params from `trait.pgs_ids`
- Passes to genomic processor

**packages/core/src/genomic-processor/server.js** & **browser.js**:
- Accepts `normalizationParams` parameter
- Passes to SharedRiskCalculator/PGSAggregator

### 4. Tools

**check-pgs.js**: CLI tool to inspect PGS scores:

```bash
pnpm checkpgs PGS003904
```

## Usage

### Adding New Traits

```bash
pnpm traits
# Normalization params are calculated automatically
```

### Checking PGS Scores

```bash
pnpm checkpgs PGS003904
```

### Result Format

```json
{
  "riskScore": 1.23,
  "rawScore": -134.26,
  "pgsDetails": {
    "PGS003904": {
      "score": -134.26,
      "normalized_score": 1.23,
      "matchedVariants": 15234
    }
  }
}
```

## Benefits

1. **Comparable Scores**: All PGS scores on same scale (standard deviations)
2. **Interpretable**: z=2.0 always means "2 SD above average"
3. **Combinable**: Multiple PGS scores for same trait can be meaningfully combined
4. **Backward Compatible**: PGS scores without normalization params work as before
