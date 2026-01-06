# @asili/core

Core genomic processing library for Asili - provides unified interfaces and progress tracking across browser, mobile, and server environments.

## Features

- **Unified Progress Tracking**: Consistent progress updates across all platforms
- **Platform-Agnostic Interfaces**: Common APIs for genomic processing, storage, and risk calculation
- **Browser Implementation**: DuckDB WASM + IndexedDB for client-side processing
- **Extensible Architecture**: Easy to add new platforms and implementations

## Installation

```bash
npm install @asili/core
```

## Quick Start

### Browser Environment

```javascript
import { createBrowserProcessor, PROGRESS_STAGES } from '@asili/core';

// Create processor with progress tracking
const { processor, progressTracker } = await createBrowserProcessor();

// Subscribe to progress updates
progressTracker.subscribe(status => {
  console.log(`${status.stage}: ${status.message} (${status.progress}%)`);
});

// Load genomic dataset
const dataset = await processor.loadDataset({
  type: 'url',
  source: '/data/trait_data.parquet'
});

// Calculate risk scores
const dnaData = {
  /* parsed DNA data */
};
const traits = [{ id: 'trait1', name: 'Trait 1', pgsIds: ['PGS000001'] }];
const scores = await processor.calculatePGS(dnaData, traits);
```

### Storage Management

```javascript
import { createBrowserStorage } from '@asili/core';

const storage = createBrowserStorage({
  dbName: 'my-genomic-data',
  version: 1
});

// Store data
await storage.store('user_results', riskScores);

// Retrieve data
const results = await storage.retrieve('user_results');
```

### Risk Calculation

```javascript
import { createRiskCalculator } from '@asili/core';

const calculator = createRiskCalculator({
  populationMean: 0,
  populationStd: 1
});

const riskScore = await calculator.calculateRisk(dnaData, trait, pgsData);
```

## Progress Tracking

The library provides unified progress tracking with standardized stages and substages:

### Progress Stages

- `IDLE`: No processing active
- `INITIALIZING`: Setting up components
- `LOADING_DATA`: Loading genomic datasets
- `PROCESSING_DNA`: Parsing and validating DNA data
- `CALCULATING_PGS`: Computing polygenic risk scores
- `FINALIZING`: Completing processing
- `COMPLETE`: Processing finished successfully
- `ERROR`: Processing failed

### Progress Substages

- **Loading**: `FETCHING_TRAITS`, `LOADING_PGS_FILES`, `PREPARING_DATABASE`
- **Processing**: `PARSING_DNA_FILE`, `VALIDATING_FORMAT`, `NORMALIZING_DATA`
- **Calculating**: `MATCHING_VARIANTS`, `COMPUTING_SCORES`, `AGGREGATING_RESULTS`

### Usage

```javascript
import { ProgressTracker, PROGRESS_STAGES } from '@asili/core';

const tracker = new ProgressTracker();

// Subscribe to updates
const unsubscribe = tracker.subscribe(status => {
  updateUI(status);
});

// Update progress
tracker.setStage(PROGRESS_STAGES.LOADING_DATA, 'Loading datasets...');
tracker.setProgress(50, 'Halfway done...');
tracker.complete('Processing finished!');

// Cleanup
unsubscribe();
```

## Interfaces

### GenomicProcessor

Base interface for genomic data processing:

```javascript
class GenomicProcessor {
  async loadDataset(source) {
    /* Load genomic dataset */
  }
  async calculatePGS(dna, traits) {
    /* Calculate risk scores */
  }
  async cacheResults(results) {
    /* Cache processing results */
  }
}
```

### StorageManager

Base interface for data storage:

```javascript
class StorageManager {
  async store(key, data) {
    /* Store data */
  }
  async retrieve(key) {
    /* Retrieve data */
  }
  async clear() {
    /* Clear all data */
  }
  async list() {
    /* List stored keys */
  }
}
```

### RiskCalculator

Base interface for risk score calculation:

```javascript
class RiskCalculator {
  async calculateRisk(dna, trait, pgsData) {
    /* Calculate single trait risk */
  }
  async batchCalculate(dna, traits, datasets) {
    /* Calculate multiple traits */
  }
}
```

## Data Types

### DNAData

```javascript
{
  format: 'string',      // DNA file format
  variants: [            // Array of genetic variants
    {
      rsid: 'rs123',
      chromosome: '1',
      position: 1000,
      genotype: 'AA'
    }
  ],
  metadata: {}           // File metadata
}
```

### TraitConfig

```javascript
{
  id: 'string',          // Trait identifier
  name: 'string',        // Human-readable name
  category: 'string',    // Trait category
  pgsIds: ['string']     // Associated PGS identifiers
}
```

### RiskScore

```javascript
{
  traitId: 'string',     // Trait identifier
  score: 0.5,            // Raw polygenic score
  percentile: 75,        // Population percentile (1-99)
  interpretation: 'string', // Risk interpretation
  metadata: {}           // Calculation metadata
}
```

## Platform Implementations

### Browser (Current)

- **Processor**: `BrowserGenomicProcessor` - Uses DuckDB WASM for SQL processing
- **Storage**: `BrowserStorageManager` - Uses IndexedDB for persistent storage
- **Calculator**: `BasicRiskCalculator` - Standard PGS calculation algorithms

### Future Platforms

- **Server**: Node.js implementation with native DuckDB
- **Mobile**: React Native with native modules for performance
- **Desktop**: Electron wrapper for desktop applications

## Testing

Run the test suite:

```bash
cd packages/core
node test.js
```

## Architecture

The library follows a modular architecture with clear separation of concerns:

```
@asili/core/
├── interfaces/        # Platform-agnostic interfaces
├── progress/          # Unified progress tracking
├── genomic-processor/ # Data processing implementations
├── storage-manager/   # Storage implementations
└── risk-calculator/   # Risk calculation implementations
```

## Contributing

1. Implement new platform-specific classes extending the base interfaces
2. Add comprehensive tests for new implementations
3. Update documentation with usage examples
4. Ensure progress tracking integration

## License

MIT License - See main project LICENSE for details.
