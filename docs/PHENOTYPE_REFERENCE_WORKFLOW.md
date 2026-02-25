# Phenotype Reference Workflow

## Overview

This document describes the complete workflow for managing phenotype reference statistics for quantitative traits in Asili.

## Quick Start

### List traits needing references
```bash
pnpm phenotype-refs list
```

### Add references interactively
```bash
pnpm phenotype-refs add
```

### Batch add common references
```bash
pnpm phenotype-refs batch
```

### Export to CSV for bulk editing
```bash
pnpm phenotype-refs export
```

## Complete Workflow

### 1. Adding a New Quantitative Trait

When adding a new trait via `pnpm traits add`:

1. **Identify if it's quantitative**: Check if the trait has a measurement unit (BMI, mg/dL, cm, etc.)
2. **Mark as quantitative** in trait_overrides.json:
   ```json
   {
     "EFO_XXXXXXX": {
       "trait_type": "quantitative",
       "unit": "mg/dL"
     }
   }
   ```
3. **Add phenotype references** (see below)

### 2. Finding Phenotype References

#### Option A: Use the Interactive Tool
```bash
pnpm phenotype-refs add
```
- Select trait from list
- Tool suggests values if available
- Enter manually if needed

#### Option B: Batch Add Common Traits
```bash
pnpm phenotype-refs batch
```
- Automatically adds references for common traits (lipids, BP, glucose, etc.)
- Based on built-in reference database

#### Option C: Manual Research

**Sources (in priority order):**

1. **UK Biobank Papers**
   - Search: `"UK Biobank" [trait name] "baseline characteristics"`
   - Look for Table 1 with mean ± SD
   - Prefer European ancestry cohort

2. **NHANES Data**
   - Visit: https://www.cdc.gov/nchs/nhanes/
   - Good for US population, clinical lab values
   - Often has age/sex stratified data

3. **Published GWAS**
   - Check supplementary materials
   - Look for phenotype standardization section
   - Extract mean/SD before standardization

**Example Search:**
```
"UK Biobank" "triglycerides" "baseline" "mean" "SD"
```

### 3. Adding References to trait_overrides.json

```json
{
  "EFO_0004530": {
    "emoji": "🧬",
    "trait_type": "quantitative",
    "editorial_name": "triglyceride level",
    "editorial_description": "A type of fat in the blood...",
    "unit": "mg/dL",
    "phenotype_mean": 150,
    "phenotype_sd": 90,
    "reference_population": "NHANES US adults, fasting"
  }
}
```

### 4. Update Database

After editing trait_overrides.json:

```bash
pnpm traits --fresh
```

This will:
1. Read updated trait_overrides.json
2. Update trait_manifest.db
3. Populate phenotype_mean, phenotype_sd, reference_population fields

### 5. Verify

```bash
duckdb data_out/trait_manifest.db -c "
  SELECT trait_id, name, phenotype_mean, phenotype_sd, reference_population 
  FROM traits 
  WHERE trait_id = 'EFO_0004530'
"
```

### 6. Export for Frontend

The pipeline automatically exports to trait_manifest.json:

```bash
cd packages/pipeline
node -e "import('./lib/export-manifest.js').then(m => m.exportTraitManifestJSON())"
```

## Built-in Reference Database

The `populate-phenotype-refs.js` script includes common references:

### Lipids (NHANES, mg/dL)
- Triglycerides: 150 ± 90
- Total cholesterol: 200 ± 40
- LDL cholesterol: 115 ± 35
- HDL cholesterol: 55 ± 15

### Blood Pressure (UK Biobank, mmHg)
- Systolic: 138 ± 19
- Diastolic: 82 ± 10

### Glucose Metabolism
- HbA1c: 5.4 ± 0.5 %
- Fasting glucose: 95 ± 12 mg/dL

### Blood Counts (UK Biobank)
- WBC: 7.0 ± 2.0 thousand/μL
- RBC: 4.7 ± 0.5 million/μL
- Platelets: 250 ± 60 thousand/μL
- Lymphocytes: 2.0 ± 0.7 thousand/μL

### Reproductive (European ancestry)
- Age at menarche: 12.5 ± 1.3 years
- Age at menopause: 50.5 ± 3.8 years

### Cardiac (UK Biobank)
- Heart rate: 70 ± 12 bpm
- PR interval: 160 ± 25 ms
- QT interval: 410 ± 30 ms
- QRS duration: 95 ± 15 ms

## Bulk Import Workflow

For adding many traits at once:

### 1. Export Missing Traits
```bash
pnpm phenotype-refs export
```

Creates `missing_phenotype_refs.csv`:
```csv
trait_id,name,unit,suggested_mean,suggested_sd,suggested_population,notes
EFO_0004530,"triglyceride level",mg/dL,150,90,"NHANES US adults, fasting",
```

### 2. Edit CSV
- Fill in mean, sd, population columns
- Add notes for documentation
- Use Excel, Google Sheets, or text editor

### 3. Convert to JSON
Create a script or manually update trait_overrides.json with the values

### 4. Refresh Database
```bash
pnpm traits --fresh
```

## Quality Checks

Before adding a reference:

✅ **Unit Match**: Verify unit matches trait unit
- mg/dL vs mmol/L
- cm vs inches
- Celsius vs Fahrenheit

✅ **SD Reasonableness**: SD typically 10-30% of mean
- BMI: mean 27, SD 5 ✓ (18%)
- Height: mean 170, SD 10 ✓ (6%)
- Triglycerides: mean 150, SD 90 ✓ (60% - high variance is normal)

✅ **Population Match**: Document the population
- European ancestry
- US adults
- Age range (if relevant)
- Fasting vs non-fasting (for metabolic traits)

✅ **Source Documentation**: Keep track of sources
- Add to notes in CSV
- Reference in commit messages
- Update ADDING_PHENOTYPE_REFERENCES.md

## Integration with manage-traits.js

When adding a new quantitative trait:

1. `pnpm traits add EFO_XXXXXXX`
2. Tool detects it's quantitative (has unit)
3. Prompts: "Add phenotype reference now? (y/n)"
4. If yes, launches interactive phenotype reference entry
5. If no, adds to list for later (`pnpm phenotype-refs list`)

## Frontend Integration

The frontend receives phenotype references in trait_manifest.json:

```json
{
  "EFO_0004340": {
    "trait_type": "quantitative",
    "unit": "BMI",
    "phenotype_mean": 27.4,
    "phenotype_sd": 4.8,
    "reference_population": "UK Biobank European"
  }
}
```

Frontend calculates estimated value:
```javascript
if (trait.phenotype_mean && trait.phenotype_sd) {
  const estimated_value = trait.phenotype_mean + (z_score * trait.phenotype_sd);
  // Display both z-score and estimated value
}
```

## Maintenance

### Regular Updates
- Review new quantitative traits monthly
- Check for updated reference values in literature
- Add ancestry-specific references as available

### Documentation
- Keep ADDING_PHENOTYPE_REFERENCES.md updated
- Document sources in commit messages
- Track coverage: `pnpm phenotype-refs list`

### Coverage Goals
- **Phase 1** (Current): Common clinical traits (lipids, BP, glucose)
- **Phase 2**: Blood counts, cardiac measurements
- **Phase 3**: Specialized traits (brain volumes, hormones)
- **Phase 4**: Ancestry-specific references

## Troubleshooting

### "No suggestions available"
- Trait name doesn't match built-in patterns
- Add manually or research the reference

### "Unit mismatch"
- Check if unit conversion needed (mg/dL ↔ mmol/L)
- Verify trait_overrides.json has correct unit

### "Values seem wrong"
- Double-check source population
- Verify fasting vs non-fasting
- Check age/sex stratification

### "Database not updated"
- Run `pnpm traits --fresh` after editing trait_overrides.json
- Check for errors in JSON syntax
- Verify database file permissions

## Commands Reference

```bash
# List traits without references
pnpm phenotype-refs list

# Add references interactively
pnpm phenotype-refs add

# Batch add common references
pnpm phenotype-refs batch

# Export to CSV
pnpm phenotype-refs export

# Refresh database after editing
pnpm traits --fresh

# Verify database contents
duckdb data_out/trait_manifest.db -c "
  SELECT COUNT(*) as total,
         SUM(CASE WHEN phenotype_mean IS NOT NULL THEN 1 ELSE 0 END) as with_refs
  FROM traits 
  WHERE trait_type = 'quantitative'
"
```

## Files

- `packages/pipeline/populate-phenotype-refs.js` - Interactive tool
- `packages/pipeline/trait_overrides.json` - Source of truth
- `data_out/trait_manifest.db` - Database with references
- `data_out/trait_manifest.json` - Frontend manifest
- `ADDING_PHENOTYPE_REFERENCES.md` - Detailed guide
- `QUANTITATIVE_TRAIT_IMPLEMENTATION.md` - Technical details
