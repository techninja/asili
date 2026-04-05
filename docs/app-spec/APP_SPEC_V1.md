# Asili v1.0 Application Spec

## What This Document Is

A complete definition of the v1.0 Asili application — sufficient for an LLM reading this spec plus the core genomic processing library to build the full application from scratch, structured as small (<150 line) files with clear input/output contracts.

This spec covers the **application layer only**. The data pipeline (ETL, imputation, refstats) and CLI scripts remain in the current codebase unchanged.

---

## Product Definition

Asili is a privacy-first polygenic risk score viewer. Users upload consumer DNA files (23andMe, AncestryDNA, etc.), and the app calculates risk scores for genetic traits entirely on their own hardware.

### What v1.0 Ships

- **Public (app.asili.dev)**: Static SPA on `app.asili.dev`, ~44 curated benign traits, browser-only processing via DuckDB WASM, no server, no accounts, no data leaves the device. Scores sparse consumer arrays (2-5% coverage) with appropriate confidence messaging and imputation upsell.
- **Self-hosted (Docker)**: Same app served from Docker, all 600+ traits, server-assisted imputation for higher coverage.

The browser scoring path uses the same `@asili/core` library as the server — `SharedRiskCalculator`, `PGSScorer`, and `GenotypedDNASource` (Map-based matching) for sparse arrays, or `UnifiedDNASource` (DuckDB WASM) when the user has imported an imputed parquet from the cloud service or local pipeline.

### What v1.0 Does NOT Ship

- User accounts, auth, payments (cloud imputation service — see `docs/CLOUD_IMPUTATION_TODO.md`)
- Server-side imputation for public tier
- Marketing/landing site (separate repo, `asili.dev` root)
- Mobile-specific UI (responsive web only)
- Advanced trait card presentation/grouping (post-launch iteration — the 44 launch traits are manageable in a simple grid; the 600+ researcher corpus needs research on categorization, filtering, and information hierarchy that will come from real usage data)

---

## Hosting Architecture

### Public Tier (app.asili.dev)

```
CDN (S3 + CloudFront / Netlify / Vercel)
├── index.html          — SPA entry point
├── assets/             — JS/CSS bundles
├── deps/wasm/          — DuckDB WASM binaries
├── data/
│   ├── trait_manifest.json    — Public filtered (44 traits)
│   ├── settings.json          — { tier: 1, version: "1.0" }
│   └── packs/                 — Parquet files (public traits only)
│       ├── EFO_0004340_hg38.parquet
│       └── ...
└── No server. No API. No telemetry.
```

All processing happens in the browser. DuckDB WASM reads parquet files via HTTP Range Requests from the CDN. IndexedDB stores user DNA and cached results per-device.

### Self-Hosted Tier (Docker)

```
docker compose up -d → localhost:4242
├── Nginx serves static app + data packs
├── Calc server (optional) — WebSocket-based scoring with imputation
└── Same SPA, different settings.json { tier: 3 }
```

---

## Data Flow

### Browser-Only (Public)

```
User uploads DNA file
  → Parser detects format (23andMe, Ancestry, MyHeritage, etc.)
  → Variants stored in IndexedDB
  → For each trait:
      DuckDB WASM loads trait parquet via HTTP Range Request
      JOIN user variants against PGS variants (chr + pos + allele_key)
      Aggregate scores per PGS
      Normalize using TOPMed-derived mean/SD from manifest
      Select best PGS by quality score
      Store result in IndexedDB
  → Display results
```

### Hybrid (Self-hosted, server-assisted)

```
User uploads DNA file
  → Variants sent to calc server via WebSocket
  → Server runs imputation (Beagle + TOPMed)
  → Server scores all traits using DuckDB (native, not WASM)
  → Results streamed back via WebSocket
  → Stored in IndexedDB
  → Display results
```

---

## Core Library (packages/core)

The genomic processing library is **shared between browser and server**. It is the proven, tested codebase from the current repo. The v1.0 app consumes it as-is.

### Key Interfaces

| Module                                           | Purpose                                 | Platform |
| ------------------------------------------------ | --------------------------------------- | -------- |
| `genomic-processor/scorer.js`                    | PGS scoring loop                        | Both     |
| `genomic-processor/calculator.js`                | Quality score, z-score, percentile      | Both     |
| `genomic-processor/dna-source/unified.js`        | DuckDB SQL pushdown scoring             | Server   |
| `genomic-processor/dna-source/genotyped-only.js` | In-memory Map scoring                   | Browser  |
| `genomic-processor/matcher.js`                   | Allele matching utilities               | Both     |
| `constants/allele-key.js`                        | Deterministic allele_key SQL expression | Both     |
| `constants/paths.js`                             | File path resolution                    | Both     |

### Data Contracts

**Trait Manifest** (`trait_manifest.json`):

```json
{
  "traits": {
    "EFO_0004340": {
      "trait_id": "EFO_0004340",
      "name": "body mass index",
      "emoji": "⚖️",
      "trait_type": "quantitative",
      "unit": "kg/m²",
      "phenotype_mean": 27.4,
      "phenotype_sd": 4.8,
      "pgs_count": 45,
      "file_path": "packs/EFO_0004340_hg38.parquet"
    }
  }
}
```

**Risk Score Result** (stored in IndexedDB per individual+trait):

```json
{
  "zScore": 1.23,
  "percentile": 89.1,
  "confidence": "high",
  "bestPGS": "PGS000027",
  "bestPGSQualityScore": 62.4,
  "bestPGSPerformance": 0.13,
  "matchedVariants": 45230,
  "totalVariants": 48000,
  "calculatedAt": "2026-03-29T...",
  "trait_type": "quantitative",
  "value": 28.7,
  "unit": "kg/m²",
  "pgsDetails": { ... },
  "pgsBreakdown": { ... }
}
```

**Parquet Schema** (trait packs):

```
variant_id    VARCHAR   — chr:pos:ref:alt
effect_allele VARCHAR   — effect allele
effect_weight DOUBLE    — PGS weight
pgs_id        VARCHAR   — PGS identifier
chr           TINYINT   — chromosome (1-25)
pos           INTEGER   — position
allele_key    BIGINT    — md5-based hash of sorted allele pair
```

**Unified DNA Parquet** (server-side):

```
variant_id          VARCHAR
genotype_dosage     FLOAT
imputed             BOOLEAN
imputation_quality  FLOAT
chr                 TINYINT
pos                 INTEGER
allele_key          BIGINT
```

---

## Application Structure

### Monorepo Layout

```
asili/
├── apps/
│   └── web/                  # v1.0 SPA (REWRITE TARGET)
│       ├── src/
│       │   ├── components/   # UI components (<150 lines each)
│       │   ├── stores/       # State management
│       │   ├── services/     # Data loading, scoring orchestration
│       │   ├── workers/      # Web Workers for off-main-thread processing
│       │   ├── utils/        # Formatting, validation helpers
│       │   └── main.js       # Entry point
│       ├── public/
│       │   └── deps/wasm/    # DuckDB WASM binaries
│       └── index.html
├── apps/
│   └── calc/                 # Calculation server (KEEP, minor updates)
├── packages/
│   ├── core/                 # Shared genomic library (KEEP AS-IS)
│   └── pipeline/             # ETL pipeline (KEEP AS-IS)
├── scripts/                  # CLI tools (KEEP AS-IS)
└── data_out/                 # Generated data (gitignored)
```

### File Size Rule

Every source file in `apps/web/src/` MUST be ≤150 lines. No exceptions. If a component or service grows beyond 150 lines, it must be decomposed into smaller files with clear import/export contracts.

---

## UI Screens

### 1. Welcome / Upload

- First-time experience: explain what Asili does, privacy promise
- File upload dropzone (drag & drop or file picker)
- Format auto-detection with supported format list
- Parse progress indicator
- Transition to individual management after successful parse

### 2. Individual Manager

- List of uploaded individuals (name, emoji, variant count, status)
- Add new individual (upload another file)
- Delete individual (with confirmation)
- Select active individual for viewing results

### 3. Trait Grid

- Virtual-scrolled grid of trait cards (44 for public, 600+ for self-hosted)
- Each card shows: emoji, name, percentile bar, z-score, confidence badge
- Category filtering (body, metabolism, cardiovascular, etc.)
- Search by trait name
- Sort by: name, percentile, confidence, category
- Cards are lazy-scored: calculation happens on first view or in background queue

### 4. Trait Detail

- Full result for one trait + one individual
- Percentile visualization (bell curve with marker)
- Best PGS info: ID, R², quality score breakdown
- PGS comparison table (top 5 by quality score)
- Top contributing variants (if available)
- Chromosome coverage heatmap
- For quantitative traits: predicted value with unit

### 5. Settings

- Deployment mode display (public / self-hosted)
- Cache management (export/import results, clear cache)
- Debug info (DuckDB version, variant count, storage usage)

---

## CLI Script Pattern

All root-level `pnpm` scripts follow a consistent progressive-disclosure pattern:

### Rules

1. **No args → interactive prompt**: `pnpm scores` shows a menu of subcommands
2. **Subcommand → interactive for remaining args**: `pnpm scores calc` prompts for individual, then trait
3. **Full args → direct execution**: `pnpm scores calc 1769791316003_Ethan EFO_0004340` runs immediately
4. **Specific args force overwrite**: When individual + trait are explicitly given, recalculate regardless of cached results
5. **Batch/"all" skips existing**: When "all" is selected (interactively or via `pnpm scores calc all`), skip already-scored items
6. **Hierarchical arg passthrough**: Args flow left-to-right through the command hierarchy via spaces

### Examples

```bash
pnpm scores                          # → interactive menu (summary, calc, validate, etc.)
pnpm scores calc                     # → prompt: pick individual → prompt: pick trait or all
pnpm scores calc all                 # → all individuals × all traits, skip existing
pnpm scores calc 1769791316003_Ethan # → prompt: pick trait or all (for this individual)
pnpm scores calc 1769791316003_Ethan EFO_0004340  # → force recalc this specific combo

pnpm etl                             # → interactive menu
pnpm etl local                       # → all traits, skip existing packs
pnpm etl local EFO_0004340           # → force rebuild this trait's pack

pnpm traits                          # → interactive menu
pnpm traits seed                     # → seed all traits
pnpm traits refresh                  # → refresh traits missing PGS data
pnpm traits refresh EFO_0004340      # → force refresh this specific trait
```

### Implementation

Each script uses `prompts` for interactive selection and `process.argv.slice(2)` for direct args. The pattern:

```js
const args = process.argv.slice(2);
const cmd = args[0];
if (cmd && COMMANDS[cmd]) {
  COMMANDS[cmd].fn(args.slice(1)); // pass remaining args
} else if (!cmd) {
  // interactive menu
}
```

---

## Individual & Family Model

Individuals are grouped by family name for multi-person households.

```
Family
├── familyName: string          — e.g., "Todd Family"
└── individuals[]
    ├── id: string              — timestamp-based unique ID
    ├── name: string            — first name
    ├── emoji: string           — avatar emoji
    ├── relationship: string    — "self" | "spouse" | "child" | "parent" | "sibling"
    ├── familyName: string      — groups individuals together
    ├── variantCount: number
    ├── status: string          — "importing" | "ready" | "scoring"
    └── hasImputed: boolean     — true if unified parquet exists
```

The UI groups individuals by `familyName` in the individual manager. A user uploading their first file is prompted for both their name and family name. Subsequent uploads default to the same family.

---

## State Management

Hybrids store models. Each model is a separate file in `src/store/`.

### IndividualModel

```js
{
  id: '',
  name: '',
  emoji: '👤',
  relationship: 'self',
  familyName: '',
  variantCount: 0,
  status: 'importing',
  hasImputed: false,
  [store.connect]: { /* IndexedDB storage */ }
}
```

### TraitModel

```js
{
  traitId: '',
  name: '',
  emoji: '',
  traitType: 'disease_risk',
  unit: null,
  pgsCount: 0,
  filePath: '',
  categories: [],
  [store.connect]: { /* loaded from manifest JSON */ }
}
```

### ResultModel

```js
{
  id: '',  // "{individualId}:{traitId}"
  zScore: null,
  percentile: null,
  confidence: 'none',
  bestPGS: null,
  matchedVariants: 0,
  totalVariants: 0,
  calculatedAt: null,
  [store.connect]: { /* IndexedDB storage */ }
}
```

### AppState (singleton)

```js
{
  activeIndividualId: null,
  searchQuery: '',
  sortBy: 'name',
  filterCategory: null,
  tier: 1,
  duckdbReady: false,
  isProcessing: false,
  queueProgress: { current: 0, total: 0 },
  error: null
}
```

---

## Web Workers

All heavy computation runs off the main thread:

### DNA Parser Worker

- Input: File blob + detected format
- Output: Parsed variant array (streamed in chunks)
- Formats: 23andMe (v3/v4/v5), AncestryDNA, MyHeritage, FamilyTreeDNA, VCF

### Scoring Worker

- Input: Individual ID + trait ID + parquet URL
- Output: RiskScoreResult
- Uses DuckDB WASM for parquet reading and variant matching
- Imports `@asili/core` calculator for normalization and quality scoring

### Queue Worker

- Manages background scoring of all traits for an individual
- Processes one trait at a time (DuckDB WASM is single-connection)
- Reports progress back to main thread
- Cancellable

---

## Performance Requirements

| Metric                          | Target  |
| ------------------------------- | ------- |
| Initial load (CDN, cached WASM) | < 2s    |
| DNA file parse (700K variants)  | < 5s    |
| Single trait score (browser)    | < 3s    |
| Full 44-trait score (browser)   | < 2 min |
| Trait grid scroll (600+ cards)  | 60fps   |
| Memory usage (scoring)          | < 500MB |

---

## Technology Stack

| Layer           | Choice                             | Rationale                                                         |
| --------------- | ---------------------------------- | ----------------------------------------------------------------- |
| Package manager | pnpm                               | Workspace support, fast, disk efficient                           |
| UI framework    | Web Components (Hybrids.js)        | No build step for components, functional/declarative, proven spec |
| State           | Hybrids store                      | Built-in, framework-native, async storage connectors              |
| Build           | None (no-build)                    | ES modules served directly, import maps for bare specifiers       |
| DB (browser)    | DuckDB WASM                        | Parquet reading, SQL JOINs, proven in current app                 |
| DB (server)     | DuckDB (native Node)               | Same queries, 10x faster than WASM                                |
| Charts          | Chart.js (lazy loaded)             | Only loaded when trait detail is opened                           |
| CSS             | Vanilla CSS with custom properties | No framework, design tokens via CSS variables                     |

---

## What Stays, What Gets Rewritten

### KEEP (proven, tested, working)

- `packages/core/` — genomic processing library
- `packages/pipeline/` — ETL pipeline
- `scripts/` — CLI tools (scores, etl, imputation, refstats)
- `apps/calc/` — calculation server (minor updates for allele_key)
- `data_out/` — generated parquet packs and manifests
- `docs/` — architecture and algorithm documentation

### REWRITE (apps/web/)

- All components — decompose into <150 line files
- State management — clean Zustand store with clear actions
- Services — scoring orchestration, data loading, caching
- Workers — proper Web Worker architecture for off-main-thread processing
- Build — Vite-based with proper bundling

### DELETE (dead code from experiments)

- `packages/core/src/unified-processor.js` (998 lines, superseded by scorer.js)
- `packages/core/src/unified-processor-browser.js` (578 lines, same)
- `packages/core/src/risk-calculator/basic.js` (137 lines, superseded by calculator.js)
- Any other dead imports identified during rewrite

---

## Quality Score Algorithm (for reference)

See `docs/PGS_QUALITY_SCORE.md`. The algorithm is implemented in `packages/core/src/genomic-processor/calculator.js` and is consumed by the app as a black box:

```
Input:  matchedVariants, totalVariants, performanceMetric, hasNormalization, zScore, genotypedVariants
Output: number (0-100)
```

The app does NOT reimplement this — it calls `SharedRiskCalculator.calculatePGSQualityScore()`.

---

## Allele Key Algorithm (for reference)

See `docs/ALLELE_KEY.md`. The deterministic hash is pre-computed in parquet files and used for JOINs:

```sql
('0x' || md5(LEAST(a3, a4) || ':' || GREATEST(a3, a4))[:15])::BIGINT
```

The app does NOT compute this — it's a column in the parquet files.

---

## Launch Checklist

- [ ] 44 public launch traits curated with editorial names/descriptions/emojis
- [ ] All parquet packs built with allele_key column
- [ ] TOPMed refstats computed with allele-aware JOIN
- [ ] Web app rewrite complete, all screens functional
- [ ] DNA upload + parse working for all supported formats
- [ ] Scoring produces results matching current CLI output
- [ ] Virtual scroll performs at 60fps with 44+ cards
- [ ] Export/import cache working
- [ ] Deployed to CDN with settings.json { tier: 1 }
- [ ] No disease traits accessible in public build
- [ ] Privacy statement visible and accurate
- [ ] README and QUICKSTART updated
