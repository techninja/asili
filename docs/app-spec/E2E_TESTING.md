# Functional / E2E Test Specification

## Architecture

```
tests/
├── e2e/                    # Playwright E2E tests
│   ├── anon.spec.js        # Anonymous user experience
│   ├── onboarding.spec.js  # First individual upload + setup
│   ├── scoring.spec.js     # Scoring progress, pause/resume
│   ├── grid.spec.js        # Trait grid, search, filters
│   ├── detail.spec.js      # Trait detail pages
│   ├── report.spec.js      # Report tab, print layout
│   └── settings.spec.js    # Settings drawer, diagnostics
├── fixtures/
│   ├── tiny-raw.txt        # ~200 variants, 23andMe format (scores in <2s)
│   ├── tiny-imputed.asili  # Small imputed pack (1 chr, ~500 variants)
│   ├── scored-state.json   # Pre-scored IndexedDB snapshot (2 individuals, 64 traits)
│   └── seed-idb.js         # Helper: inject fixture into IndexedDB before test
└── playwright.config.js
```

## Test Data Strategy

### Tiny DNA files (~200 variants each)

Generate synthetic test files containing only variants that exist in the first
few trait packs. This ensures scoring completes in <2 seconds while still
exercising the full pipeline (parse → insert → liftover → JOIN → normalize).

Source: extract ~200 positions from `data_out/packs/*.parquet` chr22, write as
23andMe format with random genotypes.

### Pre-scored fixture

Export a scored IndexedDB state (from the existing test session) as JSON. Tests
that need "fully scored" state inject this at test start — no waiting for scoring.

The fixture contains:
- 2 individuals (1 raw, 1 imputed)
- 64 trait results each with full pgsDetails/pgsBreakdown
- Variant store entries

### Trait data serving

Tests run against the dev server (`localhost:4242`) which serves `src/data/`
(symlinked to asili-lab output). For CI, we need a minimal data subset:

- `trait_manifest.json` (small, already exists)
- `pgs_norm_params.json` (small, already exists)
- 3-5 `.asili` trait packs (enough to score tiny test files)
- `hg19map.asili` (liftover, needed for raw files)

These get committed to `tests/fixtures/data/` (~5MB total) or fetched from
data.asili.dev during CI setup.

## Test Tiers & CI Integration

### On every PR / push to dev:

```yaml
- name: Unit + Component tests
  run: pnpm test:node && pnpm test:browser

- name: E2E (fast — pre-scored fixtures)
  run: pnpm test:e2e --grep @fast
```

**~45 seconds total.** Uses pre-scored IndexedDB fixtures. No real scoring.

### Nightly (or manual dispatch):

```yaml
- name: E2E (full — real scoring)
  run: pnpm test:e2e
```

**~5 minutes.** Uploads tiny DNA files, waits for scoring to complete, validates
results match expected values.

## Test Scope by Feature

### 1. Anonymous user experience `@fast`

| Test | Asserts |
|------|---------|
| Welcome page renders | h1 text, CTA button visible |
| Beta landing shows empty state | "Upload DNA" prompt, no trait cards |
| Trait detail linkable without data | URL navigable, "unscored" placeholder shown |
| Dark mode detects prefers-color-scheme | Token value changes |
| Theme toggle persists across reload | localStorage checked |

### 2. Onboarding `@slow`

| Test | Asserts |
|------|---------|
| Upload raw DNA file | File accepted, individual created in IDB |
| Upload imputed .asili file | File accepted, hasImputed=true |
| Set name and emoji | Values saved to IDB, reflected in UI |
| Trait grid shows "to be scored" | All 64 cards with pending state |
| Scoring starts automatically | Floating bar appears, progress updates |
| Scoring completes | Results in IDB, cards show percentiles |

### 3. General app use `@fast` (uses pre-scored fixture)

| Test | Asserts |
|------|---------|
| Pause/resume scoring | State toggles, floating bar updates |
| Search filters trait grid | Card count matches query |
| Category filter | Only matching traits shown |
| Sort by percentile/name/confidence | Order changes correctly |
| Individual switcher | Cards update to selected individual |
| Trait detail shows bell curve | SVG element with user marker |
| Trait detail shows top variants | Table with contribution values |
| Next/previous trait navigation | URL and content update |
| Table view columns and sort | Headers clickable, rows reorder |
| Report tab renders | Category cards, radar chart present |

### 4. Settings `@fast`

| Test | Asserts |
|------|---------|
| Rescore single individual | Results cleared, scoring restarts |
| Rescore all | All results cleared |
| Edit individual name/emoji | Updated in IDB and UI |
| Delete individual | Removed from IDB, UI updates |
| Storage info displays | MB used shown |
| Units toggle | Quantitative values change (kg↔lb) |
| Score diagnostic accordion | Opens, shows output, copy works |
| System diagnostic accordion | Opens, shows version + storage |
| Clear all data | IDB empty, redirects to / |

## Page Refresh / State Persistence `@fast`

| Test | Asserts |
|------|---------|
| Refresh during scoring → resumes | Floating bar reappears |
| Refresh while paused → stays paused | No auto-start |
| Refresh with scored data → grid shows results | Percentiles rendered |

## Running

```bash
# All fast tests (for PR)
pnpm test:e2e --grep @fast

# All tests including scoring
pnpm test:e2e

# Specific file
pnpm test:e2e tests/e2e/grid.spec.js

# Headed mode for debugging
pnpm test:e2e --headed
```

## Parallelism

Playwright can parallelize across test files but NOT within a file (shared
browser state). The fixture-based tests (`@fast`) can run in parallel since
each injects its own IDB state. The scoring tests (`@slow`) must be serial.

## Open Questions

1. **Test data in repo vs CI fetch?** Committing 5MB of trait packs keeps
   CI hermetic but bloats the repo. Alternative: CI step fetches from
   data.asili.dev.

2. **Shared browser for scoring tests?** The scoring tests could share one
   browser context — start scoring in onboarding, then run grid/detail tests
   while it scores in background. Reduces total time but adds coupling.

3. **Visual regression?** Playwright supports screenshot comparison. Worth
   adding for trait detail bell curve, report layout, etc.?
