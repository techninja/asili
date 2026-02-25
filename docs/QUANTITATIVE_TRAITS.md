# Quantitative Traits vs Disease Risk Traits

## Overview

Asili now distinguishes between two types of traits:

1. **Quantitative Traits** (81 traits): Measurements like BMR, blood pressure, cholesterol
2. **Disease Risk Traits** (69 traits): Disease susceptibility like diabetes, Alzheimer's

## How to Identify

Traits are classified based on their categories in the PGS Catalog:

**Quantitative traits** have measurement categories:
- Body measurement
- Cardiovascular measurement  
- Lipid or lipoprotein measurement
- Hematological measurement
- Inflammatory measurement
- Other measurement

**Disease traits** have disorder categories:
- Cardiovascular Disorders
- Neurological Disorders
- Metabolic Disorders
- etc.

## Understanding Scores

### Quantitative Traits

For quantitative traits, **the PGS score IS the predicted value** in the trait's natural units.

Example: `PGS003903` for Basal Metabolic Rate
- `norm_mean`: 797.66 kcal/day
- `norm_sd`: 317.01 kcal/day
- Your score: 1000.75 kcal/day
- Z-score: (1000.75 - 797.66) / 317.01 = 0.64σ

**This is NOT a risk score!** It's a prediction that your BMR is ~1001 kcal/day, which is 0.64 standard deviations above average (64th percentile).

### Disease Risk Traits

For disease traits, scores represent **relative genetic risk** compared to the population.

Example: Type 2 Diabetes
- Score: 207.52
- Z-score: 2.1σ
- Interpretation: "Higher genetic risk" (top 2% of population)

## Display Strategy

### Quantitative Traits Should Show:

```
Basal Metabolic Rate
1000.8 kcal/day
Average Range
64th percentile
```

NOT: "Risk Score: 1000.75" ❌

### Disease Traits Should Show:

```
Type 2 Diabetes
Higher Risk
98th percentile
2.1σ above average
```

## Implementation

### 1. Trait Catalog Enrichment

Run `node scripts/enrich-catalog.js` to add `trait_type` field:

```json
{
  "EFO_0007777": {
    "title": "base metabolic rate measurement",
    "trait_type": "quantitative"
  }
}
```

### 2. Frontend Display Logic

See `docs/quantitative-trait-units.js` for:
- Unit mappings (kcal/day, mmHg, mg/dL, etc.)
- Clinical reference ranges
- Risk level interpretations

### 3. Database Query

```javascript
// Check trait type before displaying
if (trait.trait_type === 'quantitative') {
  const display = getQuantitativeDisplay(trait.id, score);
  // Show: "1000.8 kcal/day (Average)"
} else {
  const display = getDiseaseRiskDisplay(score, zScore);
  // Show: "Higher Risk (98th percentile)"
}
```

## Scripts

- `pnpm quantitative` - Analyze quantitative vs disease traits
- `pnpm scores inspect <TRAIT_ID>` - Inspect specific trait details
- `node scripts/enrich-catalog.js` - Add trait_type to catalog

## Next Steps

1. ✅ Identify quantitative traits (81 found)
2. ✅ Add trait_type to catalog
3. ✅ Document units and reference ranges
4. ⏳ Update frontend to use different display logic
5. ⏳ Add unit information to trait_manifest.db
6. ⏳ Create UI components for quantitative trait cards

## Key Insight

**The "extreme" scores aren't bugs—they're just quantitative measurements being displayed as risk scores!**

A BMR of 1000 kcal/day is perfectly normal, but when displayed as "Risk Score: 1000.75" it looks alarming. The solution is to recognize these traits and display them appropriately with units and context.
