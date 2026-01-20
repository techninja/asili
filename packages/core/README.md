# Asili Core Trait Processing System

This document describes the enhanced trait processing architecture that enables comprehensive genomic risk calculation for all traits, supporting both browser and server environments.

## Architecture Overview

The system consists of several key components:

### Core Components

1. **TraitProcessor** - Handles batch processing of multiple traits
2. **JobQueue** - Manages background processing jobs with priorities
3. **AsiliCore** - Unified API that orchestrates all components
4. **ServerGenomicProcessor** - Node.js implementation for server-side processing

### Key Features

- **Batch Processing**: Calculate risk scores for all traits in one operation
- **Background Jobs**: Queue processing tasks that run without keeping browser open
- **Progress Tracking**: Real-time updates on processing status
- **Caching**: Intelligent caching to avoid recalculating existing results
- **Cross-Platform**: Works in both browser and Node.js environments

## Usage Examples

### Browser Environment

```javascript
import { createAsiliCore, createBrowserProcessor, createBrowserStorage } from '@asili/core';

// Initialize
const { processor, progressTracker } = await createBrowserProcessor();
const storage = await createBrowserStorage();
const core = await createAsiliCore(processor, storage, progressTracker);

// Load trait manifest
const response = await fetch('/data/trait_manifest.json');
const traitManifest = await response.json();

// Process all traits immediately (browser must stay open)
const results = await core.processAllTraitsImmediate('user123', traitManifest);

// Or queue for background processing
const jobId = core.queueAllTraits('user123', traitManifest);

// Process single trait with high priority
const result = await core.processSingleTrait('user123', 'MONDO:0005148', trait);

// Generate comprehensive risk report
const report = await core.generateRiskReport('user123', traitManifest);
```

### Server Environment (Future)

```javascript
import { createAsiliCore, ServerGenomicProcessor } from '@asili/core';

// Initialize server components
const processor = new ServerGenomicProcessor({ dataPath: '/data' });
const storage = new ServerStorageManager({ dbPath: '/db' });
const core = await createAsiliCore(processor, storage);

// Queue processing job
const jobId = core.queueAllTraits('user123', traitManifest, {
  batchSize: 5, // Process 5 traits concurrently
  priority: 'normal'
});

// Monitor progress via events
core.subscribe(event => {
  if (event.source === 'jobQueue' && event.event === 'jobCompleted') {
    // Notify user via websocket, email, etc.
    notifyUser(event.data);
  }
});
```

## API Reference

### AsiliCore

Main interface for trait processing operations.

#### Methods

- `processAllTraitsImmediate(individualId, traitManifest, options)` - Process all traits immediately
- `queueAllTraits(individualId, traitManifest, options)` - Queue all traits for background processing
- `processSingleTrait(individualId, traitId, traitData, options)` - Process single trait immediately
- `generateRiskReport(individualId, traitManifest)` - Generate comprehensive risk report
- `getStatus()` - Get current processing status
- `subscribe(callback)` - Subscribe to processing events

### TraitProcessor

Handles the actual trait processing logic.

#### Events

- `jobStarted` - Processing job has started
- `progress` - Processing progress update
- `traitCompleted` - Individual trait completed
- `traitFailed` - Individual trait failed
- `jobCompleted` - Entire job completed
- `jobFailed` - Job failed

### JobQueue

Manages background processing jobs with priorities.

#### Job Types

- `processAllTraits` - Process all traits for an individual
- `processSingleTrait` - Process a single trait

#### Job Priorities

- `LOW` (1) - Background processing
- `NORMAL` (2) - Standard processing
- `HIGH` (3) - Priority processing
- `URGENT` (4) - Immediate processing

## Processing Modes

### Immediate Processing (Browser)

- Processes traits one by one in the browser
- Requires browser tab to stay open
- Real-time progress updates
- Suitable for small numbers of traits or when user wants to wait

```javascript
const results = await core.processAllTraitsImmediate(individualId, traitManifest, {
  batchSize: 1,        // Process one trait at a time
  yieldInterval: 5     // Yield control every 5 traits
});
```

### Background Processing (Queue)

- Queues traits for processing
- Can continue when browser is closed (future server implementation)
- Suitable for processing all traits without user waiting

```javascript
const jobId = core.queueAllTraits(individualId, traitManifest, {
  priority: JOB_PRIORITY.NORMAL,
  batchSize: 1
});
```

## Risk Report Generation

The system can generate comprehensive risk reports that include:

- Summary statistics by trait category
- Top risk traits
- Missing traits (automatically queued for processing)
- Processing metadata

```javascript
const report = await core.generateRiskReport(individualId, traitManifest);

// Report structure:
{
  individualId: 'user123',
  generatedAt: '2024-01-07T12:00:00Z',
  totalTraits: 150,
  calculatedTraits: 120,
  missingTraits: 30,
  results: [...], // Array of calculated results
  summary: {
    categories: { ... }, // Results grouped by category
    riskLevels: { low: 50, moderate: 60, high: 10 },
    topRisks: [...] // Top 10 highest risk traits
  },
  queuedJobId: 'job_123' // If missing traits were queued
}
```

## Integration with Web Components

The system integrates seamlessly with web components:

```javascript
// Enhanced trait processor component
const processor = document.querySelector('enhanced-trait-processor');
processor.setCurrentIndividual('user123');

// Listen for events
processor.addEventListener('traitCompleted', (event) => {
  console.log('Trait completed:', event.detail);
});

processor.addEventListener('jobCompleted', (event) => {
  console.log('All traits processed:', event.detail);
});
```

## Performance Considerations

### Browser Environment

- Memory usage scales with number of traits being processed
- Large trait datasets may require yielding control to prevent UI blocking
- Caching reduces redundant calculations

### Server Environment (Future)

- Can process multiple traits concurrently
- No memory limitations from browser environment
- Persistent job queue survives server restarts
- Can notify users when processing completes

## Error Handling

The system provides comprehensive error handling:

- Individual trait failures don't stop batch processing
- Failed traits are reported in results with error messages
- Jobs can be cancelled if needed
- Automatic retry logic for transient failures (future enhancement)

## Caching Strategy

- Results are cached automatically after calculation
- Cache keys include trait version to detect updates
- Cached results are used when available and current
- Cache can be cleared per individual or globally

## Future Enhancements

1. **Server-Side Processing**: Full Node.js implementation for background processing
2. **WebSocket Communication**: Real-time updates between server and browser
3. **Distributed Processing**: Scale across multiple server instances
4. **Advanced Scheduling**: Time-based and resource-aware job scheduling
5. **Result Notifications**: Email/SMS notifications when processing completes
6. **API Endpoints**: REST API for external integrations

## Migration from Existing System

The new system is designed to be backward compatible:

1. Existing `AsiliProcessor` continues to work
2. New `AsiliCore` provides enhanced capabilities
3. Gradual migration path for existing applications
4. Same storage format for cached results

## Testing

Run the test suite to verify functionality:

```bash
cd packages/core
npm test
```

Example tests cover:
- Trait processing with mock data
- Job queue management
- Error handling scenarios
- Cache behavior
- Event emission and subscription