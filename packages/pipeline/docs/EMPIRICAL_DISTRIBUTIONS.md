# Empirical PGS Distribution Calculation

This module computes population-level polygenic score (PGS) distributions by running calculations on the 1000 Genomes Project reference dataset. This enables proper z-score normalization and percentile calculations.

## Overview

**Problem**: PGS Catalog provides variant-level normalization parameters (mean/SD of individual weights), but not population-level score distributions needed for z-scores.

**Solution**: Run PGS calculations on 2,504 reference genomes from 1000 Genomes Project to empirically derive score distributions.

## Data Requirements

### 1000 Genomes Project Phase 3
- **Size**: ~200GB compressed VCF files
- **Samples**: 2,504 individuals from 5 super-populations
- **Source**: ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/

### Population Groups
- **ALL**: All populations combined (n=2,504)
- **EUR**: European (n=503)
- **AFR**: African (n=661)
- **EAS**: East Asian (n=504)
- **SAS**: South Asian (n=489)
- **AMR**: American (n=347)

## Setup

### 1. Download 1000 Genomes Data

```bash
# Download VCF files and sample metadata (~200GB)
./packages/pipeline/scripts/setup-1000genomes.sh ./1000genomes

# This downloads:
# - Sample panel with population assignments
# - VCF files for chromosomes 1-22, X, Y
# - VCF index files (.tbi)
```

### 2. Install bcftools

```bash
# Ubuntu/Debian
sudo apt-get install bcftools

# macOS
brew install bcftools

# Or build from source
wget https://github.com/samtools/bcftools/releases/download/1.18/bcftools-1.18.tar.bz2
tar -xjf bcftools-1.18.tar.bz2
cd bcftools-1.18
./configure --prefix=/usr/local
make && sudo make install
```

### 3. Compute Empirical Distributions

```bash
# Run calculator (takes hours to days depending on hardware)
node packages/pipeline/lib/empirical-calculator.js ./data_out ./1000genomes

# Progress output:
# Loading sample metadata...
# Loaded 2504 samples
# Loading trait manifest...
# Initializing VCF processor...
# Found 2504 samples in VCF files
#
# Processing Type 2 diabetes (1/100)
#   Processed 100/2504 samples...
#   Processed 200/2504 samples...
#   ...
#   ALL: n=2504, mean=12.345, sd=4.123
#   EUR: n=503, mean=13.102, sd=3.987
#   AFR: n=661, mean=11.234, sd=4.456
#   ...
```

## Output Format

### empirical_distributions.json
```json
{
  "EFO_0005106": {
    "pgs_ids": ["PGS003846", "PGS001154"],
    "populations": {
      "ALL": {
        "mean": 12.345,
        "sd": 4.123,
        "min": 2.1,
        "max": 28.7,
        "median": 12.2,
        "n": 2504
      },
      "EUR": {
        "mean": 13.102,
        "sd": 3.987,
        "min": 3.4,
        "max": 27.9,
        "median": 13.0,
        "n": 503
      }
    }
  }
}
```

### Merged into trait_manifest.json
```json
{
  "traits": {
    "EFO_0005106": {
      "name": "type 2 diabetes mellitus",
      "pgs_ids": [...],
      "empirical_stats": {
        "ALL": {"mean": 12.345, "sd": 4.123, "n": 2504},
        "EUR": {"mean": 13.102, "sd": 3.987, "n": 503},
        ...
      }
    }
  }
}
```

## Usage in Application

### Calculate Z-Score
```javascript
const userScore = 18.5;
const empirical = trait.empirical_stats.ALL;
const zScore = (userScore - empirical.mean) / empirical.sd;
// zScore = 1.48σ
```

### Calculate Percentile
```javascript
function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

const percentile = normalCDF(zScore) * 100;
// percentile = 93.1%
```

### Ancestry-Specific Comparison
```javascript
// User selects ancestry
const ancestry = 'EUR';
const empirical = trait.empirical_stats[ancestry];
const zScore = (userScore - empirical.mean) / empirical.sd;
```

## Performance Optimization

### Parallel Processing
```javascript
// Process multiple traits in parallel
const workers = 8;
const traitChunks = chunkArray(traits, Math.ceil(traits.length / workers));

await Promise.all(
  traitChunks.map(chunk => processTraitChunk(chunk))
);
```

### Incremental Updates
```bash
# Only compute for new traits
node packages/pipeline/lib/empirical-calculator.js \
  --incremental \
  --traits EFO_0005106,MONDO_0005010
```

### Caching
- Store intermediate results per trait
- Resume from last checkpoint on failure
- Skip already-computed traits

## Validation

### Compare with Published Values
Some PGS Catalog entries include validation cohort statistics. Compare empirical results:

```javascript
// PGS003846 validation cohort: mean=12.1, sd=4.0
// Our empirical: mean=12.345, sd=4.123
// Difference: 2% (acceptable)
```

### Distribution Checks
```javascript
// Verify normal distribution
const { mean, sd, min, max } = empirical.ALL;
assert(min > mean - 4*sd, 'Min within 4σ');
assert(max < mean + 4*sd, 'Max within 4σ');
```

## Computational Requirements

### Time Estimates
- **Per sample**: ~1-5 seconds (depends on trait size)
- **Per trait**: 2,504 samples × 3 sec = ~2 hours
- **All 100 traits**: ~200 hours = 8 days single-threaded
- **With 8 cores**: ~1 day

### Memory Requirements
- **VCF processing**: ~2GB per chromosome
- **Score calculation**: ~500MB per trait
- **Total**: 4-8GB RAM recommended

### Storage Requirements
- **Input**: 200GB (1000 Genomes VCF)
- **Output**: ~5MB (empirical_distributions.json)
- **Temp**: ~50GB (intermediate results)

## Troubleshooting

### bcftools not found
```bash
which bcftools
# If not found, install per instructions above
```

### VCF files corrupted
```bash
# Verify integrity
bcftools index -s 1000genomes/vcf/chr1.vcf.gz

# Re-download if needed
rm 1000genomes/vcf/chr1.vcf.gz*
./packages/pipeline/scripts/setup-1000genomes.sh ./1000genomes
```

### Out of memory
```bash
# Reduce batch size
node --max-old-space-size=4096 packages/pipeline/lib/empirical-calculator.js
```

## Future Enhancements

1. **UK Biobank Integration**: Add 500K samples for better power
2. **Ancestry-Specific PGS**: Compute separate scores per population
3. **Confidence Intervals**: Bootstrap resampling for uncertainty
4. **Continuous Updates**: Auto-recompute when new traits added
