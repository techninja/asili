# Recovering Filtered PGS Scores Using Performance Metrics

## Problem

You're filtering out 70%+ of PGS scores because:
1. **NR (Not Reported) weight types** - incompatible scales
2. **Zero variance weights** - all weights identical
3. **Integrative methods** - meta-analyses combining multiple PGS
4. **Extreme weights** - outlier values that break normalization

## Solution: Use PGS Catalog Metadata

### 1. Performance Metrics (Validation Data)

Every PGS in the catalog has **Performance Metrics** from validation studies:

```javascript
{
  "performance_metric": "C-index",  // or "R²", "AUC", "OR", "HR"
  "estimate": 0.63,                 // The actual performance value
  "ci_lower": 0.61,                 // Confidence interval
  "ci_upper": 0.65,
  "sample_size": 50000,
  "ancestry_broad": "European"
}
```

**Use cases:**
- **Quality filter**: Only include PGS with C-index > 0.55 or R² > 0.05
- **Performance weighting**: Weight each PGS by its validation performance
- **Ancestry matching**: Prefer PGS validated in user's ancestry

### 2. Effect Allele Frequency (EAF) as Weight Proxy

For NR (Not Reported) weight types, use **effect allele frequency** as a proxy:

```
weight_proxy = log(EAF / (1 - EAF))
```

This works because:
- Rare variants (low EAF) typically have larger effects
- Common variants (high EAF) typically have smaller effects
- Log-odds transformation creates a reasonable weight scale

### 3. Evaluated Samples Metadata

Use sample size and ancestry to:
- **Prioritize well-powered studies** (larger N = more reliable)
- **Match user ancestry** (European, African, East Asian, etc.)
- **Detect population-specific effects**

## Implementation

### Quick Analysis

Run the analysis tool on any trait:

```bash
cd packages/pipeline
node analyze-trait-quality.js MONDO:0005575  # colorectal cancer
```

This shows:
- How many PGS are currently excluded
- How many can be recovered using EAF + performance metrics
- Performance metrics for each PGS
- Reasons for exclusion

### Integration into Pipeline

Update `manage-traits.js` to use enhanced filtering:

```javascript
import { enhancedPGSFilter } from './lib/pgs-enhanced-filter.js';

// Instead of:
const filterResult = await shouldExcludePGS(pgsId, scoreData, pgsApiClient);

// Use:
const filterResult = await enhancedPGSFilter(pgsId, scoreData, pgsApiClient);

if (filterResult.include) {
  pgsWithNorm.push({
    id: pgsId,
    norm_mean: stats.mean,
    norm_sd: stats.sd,
    weight_type: scoreData.weight_type,
    method: scoreData.method_name,
    performance_weight: filterResult.performance_weight,  // NEW
    weight_proxy: filterResult.weight_proxy,              // NEW (for NR)
    validation: filterResult.performance_metrics          // NEW
  });
}
```

## Expected Impact

Based on typical PGS Catalog distributions:

| Category | Before | After | Gain |
|----------|--------|-------|------|
| Standard weights (beta, OR) | 20-30% | 20-30% | 0% |
| NR with validation | 0% | 15-25% | +15-25% |
| NR without validation | 0% | 5-10% | +5-10% |
| **Total inclusion** | **20-30%** | **40-65%** | **+20-35%** |

## Trade-offs

### Pros
- 2-3x more PGS scores available per trait
- Better coverage of genetic variants
- Performance-weighted aggregation is more accurate
- Can match user ancestry

### Cons
- EAF-based weights are approximations (less accurate than true betas)
- Requires fetching additional metadata (slower pipeline)
- More complex normalization logic
- Need to validate that EAF proxy doesn't introduce bias

## Next Steps

1. **Run analysis** on your key traits (colorectal cancer, diabetes, etc.)
2. **Review recovered PGS** - do they make biological sense?
3. **Test on real data** - compare z-scores with/without recovered PGS
4. **Validate ancestry matching** - ensure performance metrics match user population
5. **Update trait catalog schema** to store performance metadata

## Alternative: Variant-Level Aggregation

If EAF proxy doesn't work well, consider:
- **Ignore PGS-level scores entirely**
- **Aggregate at variant level** using effect allele counts
- **Use LD-pruned variant sets** to avoid double-counting
- **Weight by allele frequency** across all PGS

This is more complex but avoids the "incompatible scale" problem entirely.
