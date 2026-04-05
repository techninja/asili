# Asili PGS Quality Score

## Overview

The quality score (0-100) ranks PGS results by combining **scientific validity**, **data reliability**, and **individual informativeness**. It determines which PGS is selected as "best" for a trait when multiple PGS are available.

The score lives in [`packages/core/src/genomic-processor/calculator.js`](../packages/core/src/genomic-processor/calculator.js) as `SharedRiskCalculator.calculatePGSQualityScore()`.

## Formula

```
Quality Score = (R² × 35 × CoveragePenalty)
             + (ValidationBonus × 15)
             + (GenotypedRatio × 15)
             + (Coverage × 10)
             + (log₁₀(matched/8) × 10)
             + (Normalization × 5)
             + (Signal × 10)
```

## Components

### 1. Predictive Accuracy (R²) — 35% weight

R² from PGS Catalog validation studies, measuring variance explained. Sourced from `pgs_performance` table (raw R² and "PGS R² (no covariates)" metrics only — incremental R² excluded as not comparable).

Values >1 are treated as percentages and normalized to 0-1. Default 0.05 when no validation data exists.

**Coverage Penalty** (applied to R² only):

- **<5% coverage**: Severe — `(coverage/0.05)²`
- **5-20% coverage**: Moderate — `√(coverage/0.20)`
- **>20% coverage**: None

### 2. Validation Bonus — 15% weight (NEW)

A PGS with independently validated R² from the PGS Catalog is fundamentally more trustworthy than one with no validation data. This bonus ensures validated PGS rank above unvalidated ones even when the unvalidated PGS has more matched variants or a more extreme z-score.

Formula: `min(R² / 0.44, 1) × 15` (only when R² > 0.05 default)

| R²    | Bonus | Notes                           |
| ----- | ----- | ------------------------------- |
| 0.05  | 0     | Default R² — no validation data |
| 0.10  | 3.4   | Modest validation               |
| 0.20  | 6.8   | Good validation                 |
| 0.44+ | 15.0  | Excellent validation (capped)   |

**Why this matters**: Without this bonus, a PGS with default R²=0.05 and 1.2M matched variants (quality ~36) would outrank a PGS with validated R²=0.44 and 18 matched variants (quality ~30). The validated PGS is scientifically superior — its predictive power was confirmed in an independent cohort study. The bonus corrects this ranking.

### 3. Data Reliability — 15% weight

Proportion of matched variants that are directly genotyped (not imputed).

Formula: `genotypedVariants / matchedVariants × 15`

### 4. Coverage — 10% weight

Percentage of PGS variants found in user's DNA.

Formula: `min(matched/total, 1) × 10`

### 5. Sample Size — 10% weight

Number of variants matched, log-scaled with diminishing returns.

Formula: `min(log₁₀(matched/8) / 3.1, 1) × 10`

The minimum threshold is 8 matched variants — below this, the PGS is marked `insufficientData` and excluded from best-PGS selection entirely.

### 6. Normalization — 5% weight

Whether population statistics (TOPMed mean/SD) exist for percentile calculation.

- Has empirical mean/SD: **5 pts**
- Missing (calculator uses theoretical fallback): **2.5 pts**

### 7. Signal Strength — 10% weight

How informative the result is for this individual, based on absolute z-score.

Formula: `min(|z| / 3, 1) × 10`

**With >5σ penalty**: If `|z| > 5`, signal score is **0 points**. A z-score beyond 5σ almost certainly indicates incompatible normalization statistics, not genuine extreme genetic risk.

| z-score | Signal pts | Interpretation      |
| ------- | ---------- | ------------------- |
| 0σ      | 0          | Average — no signal |
| 1σ      | 3.3        | Moderate            |
| 2σ      | 6.7        | Strong              |
| 3σ+     | 10         | Capped at maximum   |
| >5σ     | **0**      | Bad stats penalty   |

## Weight Summary

```
Scientific Validity (50%):
  R² × CoveragePenalty    35%   How well does this PGS predict the trait?
  Validation Bonus         15%   Has it been independently validated?

Data Quality (25%):
  Data Reliability         15%   Are we using real DNA or statistical estimates?
  Coverage                 10%   Do we have the variants the PGS needs?

Interpretability (15%):
  Sample Size              10%   Enough data points?
  Normalization             5%   Can we calculate percentiles?

Informativeness (10%):
  Signal Strength          10%   How much do we learn about this individual?
```

## Design Rationale

### Why Validation Bonus exists

Before this component, 357 out of 362 PGS for a trait could all score ~51 with default R²=0.05, while the 5 PGS with real validated R² scored ~35-45 due to fewer matched variants. The trait result would inherit a z-score from an essentially random unvalidated PGS.

The Validation Bonus ensures that a PGS which has been tested in an independent cohort study always ranks above one that hasn't, unless the validated PGS has catastrophically low coverage or data quality.

### Why Signal was reduced from 20% to 10%

Signal Strength is personalized — it measures how informative a result is for _this_ individual. But at 20%, it dominated the score for unvalidated PGS: a PGS with z=4.9σ (just under the penalty threshold) got 20 signal points, making it rank higher than a validated PGS with a moderate z=1.5σ. Reducing to 10% keeps signal as a tiebreaker without letting it override scientific validity.

## Normalization: How Z-Scores Are Calculated

Z-scores convert raw PGS sums into population-relative measures.

### Normalization Source: TOPMed Allele Frequencies

Mean and SD are computed from the theoretical distribution using allele frequencies from the TOPMed imputation reference panel (~70M variants). See [PGS_NORMALIZATION.md](PGS_NORMALIZATION.md) for details.

### >5σ Exclusion from Trait Z-Score

PGS with |z| > 5 are:

1. Given **0 signal points** in the quality score
2. **Excluded from the weighted trait-level z-score**

### Normalization Decision Tree

```
Has empirical mean/SD in manifest?
├── YES: User coverage ≥ 5%?
│   ├── YES: naiveZ > 20 AND user coverage < 80%?
│   │   ├── YES → Incompatible stats, use theoretical
│   │   └── NO  → Use empirical stats unscaled
│   └── NO  → Use theoretical normalization
└── NO → Use theoretical normalization
         (mean=0, sd=√(Σw²×0.5))
```

## Interpretation

| Score | Rating    | Characteristics                                             |
| ----- | --------- | ----------------------------------------------------------- |
| 65+   | Excellent | High validated R², good coverage, strong signal             |
| 50-65 | Good      | Validated R² with decent coverage, or high coverage default |
| 35-50 | Moderate  | Some validation or good coverage without validation         |
| 0-35  | Limited   | No validation, low coverage, or insufficient data           |

## Testing

Quality score logic is tested in [`packages/core/tests/calculator.test.js`](../packages/core/tests/calculator.test.js):

```bash
pnpm test core
```
