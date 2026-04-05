# Asili App — Build Guide

## What This Is

Asili is a privacy-first polygenic risk score (PGS) analysis app. Users upload consumer DNA files (23andMe, AncestryDNA), and the app calculates genetic trait scores entirely in their browser using DuckDB WASM. No server, no accounts, no data leaves the device.

This repo is a fresh build from proven specifications. The science and data pipeline were validated in a separate experimental repo (`asili-lab`). This repo implements the application layer only.

## How to Read the Docs

### `docs/clearstack/` — How to Build

The Clearstack spec defines the engineering rules: Hybrids.js web components, no-build ES modules, 150-line file limit, atomic design hierarchy, testing patterns. Read these first.

Key files:

- `FRONTEND_IMPLEMENTATION_RULES.md` — master index, philosophy, project structure
- `COMPONENT_PATTERNS.md` — how to write components
- `CONVENTIONS.md` — naming, anti-patterns, error handling
- `TESTING.md` — test philosophy, tools, build-phase checkpoints
- `STATE_AND_ROUTING.md` — Hybrids store and router patterns

### `docs/app-spec/` — What to Build

The Asili-specific specs define the product, data contracts, algorithms, and business model. Extracted from a working prototype with 3 individuals scored across 647 traits.

Reading order:

1. `APP_SPEC_V1.md` — master definition: what ships, screens, CLI patterns
2. `TIER_ARCHITECTURE.md` — business model: free app, paid imputation, open source
3. `DATA_CONTRACTS.md` — parquet schemas, manifest format, result shapes, IndexedDB
4. `DATA_LAYER_ARCHITECTURE.md` — universal adapter pattern (browser vs server)
5. `SCORING_PIPELINE.md` — the algorithm flow
6. `ALLELE_KEY.md` — deterministic hashing for allele-aware JOINs
7. `PGS_QUALITY_SCORE.md` — how PGS are ranked
8. `PGS_NORMALIZATION.md` — TOPMed-derived z-score normalization
9. `BROWSER_SCORING_PERFORMANCE.md` — DuckDB WASM perf, pack sizes
10. `QUANTITATIVE_RENDERING.md` — how to display 40+ different units
11. `TRAIT_PRESENTATION.md` — deep dive UI ideas
12. `REPORTS_AND_META_ANALYSIS.md` — radar chart, printable reports

## Build Order

Each phase must pass its tests before starting the next.

### Phase 1: Core Scoring Library (`packages/core/`)

Port the proven scoring engine from asili-lab, decomposed into <150 line files with tests. Pure functions, no DOM, no framework — runs in Node and browser.

- Calculator: quality score, z-score, percentile, confidence, theoretical SD
- Scorer: per-PGS accumulation, normalization, best PGS selection
- Matcher: allele-key hash, effect allele counting, position key extraction
- Formatter: quantitative unit display

Tests: `node:test` for all pure functions.

### Phase 2: Data Layer (`packages/core/src/data-layer/`)

Universal adapter interface + browser IndexedDB/DuckDB WASM implementation.

- Interface definition (JSDoc)
- Browser adapter: IndexedDB for storage, DuckDB WASM for scoring
- Factory: detect mode → return adapter

### Phase 3: DNA Parser

Web Worker that parses consumer DNA files into a uniform variant format.

- Format auto-detection (23andMe, AncestryDNA, MyHeritage, VCF)
- Per-format parsers
- Worker message protocol for progress reporting

### Phase 4: Atoms + Store

Base UI components and Hybrids store models.

- Store: AppState, IndividualModel, TraitModel, ResultModel
- Atoms: button, badge, icon, percentile-bar, confidence-badge

### Phase 5: Upload Flow (First Working Feature)

Upload → parse → store → display variant count. The core loop.

### Phase 6: Scoring + Trait Grid

DuckDB WASM scoring in Web Worker + trait card grid with results.

### Phase 7: Trait Detail + Family Comparison

Deep dive views: PGS breakdown, variant spotlight, chromosome heatmap.

### Phase 8: Reports + Radar Chart

Category-level analysis and printable report page.

## What NOT to Build

- Server/hybrid mode — post-launch
- Cloud imputation — separate private repo
- User accounts/auth — only for imputation service
- Marketing site — separate repo
- CLI scripts — port from asili-lab when needed

## Key Constraints

- 150 lines per file — hard limit
- No build step — ES modules, import maps
- pnpm — package manager
- Tests before next phase
- Browser-first — DuckDB WASM before server paths

## Brand Direction (TBD)

- **Palette**: Deep charcoal (#1a1a2e), warm amber (#e2a84b), cool teal (#2ec4b6), off-white (#f0ede8)
- **Logo**: TBD — placeholder wordmark "Asili" until designed
- **Typography**: Geometric sans-serif (Inter, Outfit, or system stack)
- **Tone**: Scientific but warm. Not clinical, not hype. Trustworthy and precise.
- **Animation**: Purposeful only — state changes, not decoration. Respect `prefers-reduced-motion`.
- **No modals**: All interactions expand inline or navigate.
