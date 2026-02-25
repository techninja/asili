# Risk Storage Refactor

## Problem
- Single `risk_scores` table with JSON columns (`pgs_breakdown`, `pgs_details`)
- `matched_variants` was aggregated across ALL PGS (misleading)
- Per-PGS metrics buried in JSON, requiring parsing
- No SQL-queryable minimum variant thresholds
- Frontend duplicated PGS selection logic

## Solution

### New Schema (002_create_risk_results.sql)

**trait_results** - One row per individual-trait
```sql
individual_id, trait_id (PK)
best_pgs_id, best_pgs_performance
overall_z_score, overall_percentile, overall_confidence
total_matched_variants, total_expected_variants
trait_last_updated, calculated_at
```

**pgs_results** - One row per individual-trait-PGS
```sql
individual_id, trait_id, pgs_id (PK)
raw_score, z_score, percentile
matched_variants, expected_variants
confidence, insufficient_data (BOOLEAN)
performance_metric
positive_variants, positive_sum, negative_variants, negative_sum
```

**pgs_top_variants** - Top contributing variants per PGS
```sql
individual_id, trait_id, pgs_id
variant_id, effect_allele, effect_weight
user_genotype, chromosome
contribution, standardized_contribution, rank
```

### Canonical Logic (shared-calculator.js)

**MIN_VARIANT_THRESHOLD = 8**
- Marks PGS with `insufficientData: true` when `matchedVariants < 8`
- Excludes insufficient PGS from best PGS selection
- Excludes insufficient PGS from weighted z-score average

**Best PGS Selection**
1. Filter out `insufficientData` PGS
2. Select highest `performance_metric` (R²)
3. Use best PGS z-score for overall score
4. Fallback to weighted average if no best PGS

**PGS Ordering**
1. Insufficient data to bottom
2. Sort by performance_metric DESC
3. Sort by contribution magnitude DESC

### Database API (risk-results-db.js)

```javascript
storeResults(individualId, traitId, calculatorResults, traitLastUpdated)
getTraitResult(individualId, traitId)
getPgsResults(individualId, traitId, orderBy='best')
getPgsTopVariants(individualId, traitId, pgsId)
getBestPgs(individualId, traitId)
```

### Storage Integration (server.js)

- `storeRiskScore()` - Writes to normalized tables
- `getCachedRiskScore()` - Joins trait_results + pgs_results
- `initializeEmptyParquet()` - Creates new schema

### Frontend (trait-card.js)

- Receives pre-computed `bestPGS` from backend
- Uses same sorting logic as calculator
- Displays insufficient data PGS at bottom with visual de-emphasis

## Migration

**Delete existing DB:**
```bash
rm data_out/risk_scores.db
```

**Restart server** - Will auto-create new schema

## Benefits

1. **No JSON parsing** - All metrics in proper columns
2. **SQL queries** - Filter by confidence, insufficient_data, performance
3. **Single source of truth** - Calculator determines best PGS
4. **Proper constraints** - MIN_VARIANT_THRESHOLD enforced
5. **Scalable** - Can add per-PGS metadata without schema changes
