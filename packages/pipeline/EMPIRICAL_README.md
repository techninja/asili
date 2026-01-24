# Empirical Distribution Pipeline

Ground truth PGS normalization using 1000 Genomes Project reference data.

## Quick Start

```bash
# 1. Download 1000 Genomes data (~200GB)
./packages/pipeline/scripts/setup-1000genomes.sh

# 2. Compute empirical distributions (takes hours/days)
node packages/pipeline/lib/empirical-calculator.js

# 3. Results automatically merged into trait_manifest.json
```

## What This Provides

- **Z-scores**: "You're 1.5σ above average"
- **Percentiles**: "You're in the 93rd percentile"
- **Ancestry-specific**: Compare to EUR, AFR, EAS, SAS, AMR populations
- **Ground truth**: Based on 2,504 real genomes, not theoretical distributions

## Architecture

```
1000 Genomes VCF → VCFProcessor → GenomicProcessor → Statistics
     (200GB)         (bcftools)      (PGS calc)      (mean/SD)
                                                          ↓
                                              empirical_distributions.json
                                                          ↓
                                                trait_manifest.json
```

## Output Example

```json
{
  "EFO_0005106": {
    "empirical_stats": {
      "ALL": {"mean": 12.345, "sd": 4.123, "n": 2504},
      "EUR": {"mean": 13.102, "sd": 3.987, "n": 503}
    }
  }
}
```

## Usage in App

```javascript
import { SharedRiskCalculator } from '@asili/core';

// Calculate raw score
const result = await processor.calculateRisk(variants, traitFile);

// Convert to z-score and percentile
const empirical = trait.empirical_stats.ALL;
const zScore = SharedRiskCalculator.calculateZScore(result.riskScore, empirical);
const percentile = SharedRiskCalculator.calculatePercentile(zScore);

console.log(`Score: ${result.riskScore.toFixed(2)}`);
console.log(`Z-score: ${zScore.toFixed(2)}σ`);
console.log(`Percentile: ${percentile.toFixed(1)}%`);
```

## Performance

- **Time**: ~8 days single-threaded, ~1 day with 8 cores
- **Memory**: 4-8GB RAM
- **Storage**: 200GB input, 5MB output

See [EMPIRICAL_DISTRIBUTIONS.md](docs/EMPIRICAL_DISTRIBUTIONS.md) for full documentation.
