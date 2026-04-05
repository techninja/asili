# Data Layer Architecture

## Problem

Asili runs in two modes with different storage backends:

| Mode                     | Storage                    | Scoring                 | Deployment |
| ------------------------ | -------------------------- | ----------------------- | ---------- |
| **Browser (Public)**     | IndexedDB + DuckDB WASM    | Client-side Web Worker  | Static CDN |
| **Hybrid (Self-hosted)** | DuckDB native + filesystem | Server-side calc server | Docker     |

The UI components need the same data regardless of mode. Without abstraction, every component would need `if (hybrid) { fetch(...) } else { indexedDB.get(...) }` branching.

## Solution: Universal Data Layer

A single API contract implemented by two adapters. Components import the data layer and call methods — they never know or care which adapter is active.

```
┌─────────────────────────────────────────────┐
│              UI Components                   │
│  (import { dataLayer } from 'data-layer')   │
└──────────────────┬──────────────────────────┘
                   │
         dataLayer.getIndividuals()
         dataLayer.getRiskScore(id, trait)
         dataLayer.scoreTrait(id, trait)
                   │
          ┌────────┴────────┐
          │   Data Layer    │
          │   (interface)   │
          └────────┬────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
  ┌─────┴─────┐       ┌──────┴──────┐
  │  Browser   │       │   Hybrid    │
  │  Adapter   │       │   Adapter   │
  ├────────────┤       ├─────────────┤
  │ IndexedDB  │       │ fetch()     │
  │ DuckDB WASM│       │ → Express   │
  │ Web Worker │       │ → DuckDB    │
  └────────────┘       └─────────────┘
```

## Interface Contract

Every method returns a Promise. The interface is the same in both modes.

### Individuals

```js
/** @returns {Promise<Individual[]>} */
dataLayer.getIndividuals();

/** @returns {Promise<Individual>} */
dataLayer.getIndividual(id);

/** @returns {Promise<Individual>} */
dataLayer.addIndividual({ name, emoji, relationship, familyName });

/** @returns {Promise<Individual>} */
dataLayer.updateIndividual(id, updates);

/** @returns {Promise<void>} */
dataLayer.deleteIndividual(id);
```

### DNA

```js
/**
 * Parse and store a DNA file for an individual.
 * Browser: parse in Web Worker, store in IndexedDB
 * Hybrid: upload to server, server stores as JSON + runs imputation
 * @returns {Promise<{ variantCount: number, format: string }>}
 */
dataLayer.uploadDNA(individualId, file, onProgress);

/** @returns {Promise<boolean>} */
dataLayer.hasImputedData(individualId);
```

### Scoring

```js
/**
 * Score a single trait for an individual.
 * Browser: DuckDB WASM in Web Worker
 * Hybrid: POST /calculate/risk → server scores via native DuckDB
 * @returns {Promise<RiskScoreResult>}
 */
dataLayer.scoreTrait(individualId, traitId, onProgress);

/**
 * Score all traits for an individual (queue-based).
 * Browser: sequential in Web Worker, skip existing
 * Hybrid: WebSocket queue with progress
 * @returns {Promise<void>}
 */
dataLayer.scoreAllTraits(individualId, {
  skipExisting,
  onProgress,
  onComplete
});

/** Cancel an in-progress scoring queue */
dataLayer.cancelScoring();
```

### Results

```js
/** @returns {Promise<RiskScoreResult | null>} */
dataLayer.getRiskScore(individualId, traitId);

/** @returns {Promise<TraitResultSummary[]>} all scored traits for an individual */
dataLayer.getAllResults(individualId);

/** @returns {Promise<ChartSummary[]>} summary data for charts/grid */
dataLayer.getResultsSummary(individualId);
```

### Traits

```js
/** @returns {Promise<TraitManifest>} full manifest (loaded once on startup) */
dataLayer.getTraitManifest();

/** @returns {Promise<TraitMetadata>} detailed trait info including PGS list */
dataLayer.getTraitDetail(traitId);

/** @returns {Promise<PGSMetadata>} PGS info including performance metrics */
dataLayer.getPGSDetail(pgsId);
```

### Cache

```js
/** @returns {Promise<Blob>} exportable cache file */
dataLayer.exportCache(individualId);

/** @returns {Promise<void>} */
dataLayer.importCache(individualId, blob);

/** @returns {Promise<void>} */
dataLayer.clearCache(individualId);
```

### System

```js
/** @returns {Promise<{ tier: number, mode: 'browser' | 'hybrid', duckdbReady: boolean }>} */
dataLayer.getStatus();

/** @returns {Promise<void>} initialize the data layer (load WASM, connect to server, etc.) */
dataLayer.initialize();
```

## Adapter Implementations

### Browser Adapter

```
dataLayer.initialize()
  → Load DuckDB WASM in Web Worker
  → Open IndexedDB stores
  → Fetch trait_manifest.json from CDN

dataLayer.getIndividuals()
  → IndexedDB.getAll('individuals')

dataLayer.uploadDNA(id, file)
  → Web Worker: parse file → detect format → extract variants
  → IndexedDB.put('variants', { id, variants })
  → Update individual status

dataLayer.scoreTrait(id, traitId)
  → Web Worker: DuckDB WASM
    → Load variants from IndexedDB into DuckDB table
    → HTTP Range Request for trait parquet from CDN
    → JOIN on chr + pos + allele_key
    → Run calculator.finalize()
  → IndexedDB.put('results', result)
  → Return result

dataLayer.getRiskScore(id, traitId)
  → IndexedDB.get('results', `${id}:${traitId}`)

dataLayer.getTraitDetail(traitId)
  → From cached manifest (already loaded)
  → No server call needed — manifest has all metadata
```

### Hybrid Adapter

```
dataLayer.initialize()
  → fetch('/health') to verify server
  → fetch('/data/trait_manifest.json')

dataLayer.getIndividuals()
  → fetch('/individuals')

dataLayer.uploadDNA(id, file)
  → POST /dna/upload (multipart)
  → Server parses, stores, optionally imputes

dataLayer.scoreTrait(id, traitId)
  → POST /calculate/risk { individualId, traitId }
  → Server scores via native DuckDB
  → Returns RiskScoreResult

dataLayer.getRiskScore(id, traitId)
  → fetch(`/api/risk-score/${id}/${traitId}`)

dataLayer.getTraitDetail(traitId)
  → fetch(`/api/traits/${traitId}`)
  → Server joins trait_manifest.db + pgs_performance
```

## Mode Detection

On startup, the app checks `settings.json`:

```json
{ "tier": 1 }  → Browser adapter
{ "tier": 3 }  → Hybrid adapter (verify server is reachable, fall back to browser)
```

Or detect automatically:

```js
async function detectMode() {
  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) return 'hybrid';
  } catch {}
  return 'browser';
}
```

## Shared Query Logic

The actual data transformation logic (not the transport) lives in shared modules that both adapters import:

```
packages/core/src/
├── queries/
│   ├── individuals.js      — buildIndividualSummary(raw) → Individual
│   ├── risk-scores.js       — buildRiskResult(raw) → RiskScoreResult
│   ├── traits.js            — buildTraitDetail(trait, pgsScores) → TraitMetadata
│   └── charts.js            — buildChartSummary(results) → ChartSummary[]
├── genomic-processor/       — scoring engine (existing)
└── constants/               — paths, allele-key (existing)
```

These are pure functions that transform raw DB rows into the API response shape. The browser adapter calls them after IndexedDB/DuckDB queries. The server adapter calls them after DuckDB native queries. Same logic, same output.

## WebSocket (Hybrid Only)

The hybrid adapter uses WebSocket for long-running operations (scoring queue, DNA upload progress). The browser adapter uses Web Worker `postMessage` for the same purpose.

Both expose the same callback interface to components:

```js
dataLayer.scoreAllTraits(individualId, {
  onProgress: ({ current, total, traitName }) => { ... },
  onComplete: () => { ... },
  onError: (err) => { ... }
});
```

The component doesn't know if progress comes from a WebSocket or a Worker message.

## File Organization

```
packages/core/src/
├── data-layer/
│   ├── interface.js          — JSDoc interface definition
│   ├── browser-adapter.js    — IndexedDB + DuckDB WASM implementation
│   ├── hybrid-adapter.js     — fetch + WebSocket implementation
│   ├── create.js             — Factory: detectMode() → adapter instance
│   └── index.js              — Re-export
├── queries/                  — Shared data transformation logic
└── genomic-processor/        — Scoring engine
```

Each adapter file stays under 150 lines by delegating:

- Scoring logic → `genomic-processor/`
- Data transformation → `queries/`
- Storage operations → platform-specific (IndexedDB API / fetch API)

## What This Enables

1. **Single component codebase** — no if/else branching for mode
2. **Testable** — mock the data layer interface for component tests
3. **Progressive enhancement** — start browser-only, upgrade to hybrid when server detected
4. **Future-proof** — cloud imputation adapter slots in as a third implementation
5. **Offline capable** — browser adapter works without any network after initial load
