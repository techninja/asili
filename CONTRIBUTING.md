# Contributing to Asili

Welcome! Asili is a privacy-first polygenic risk score app that runs entirely
in the browser. This document explains how to contribute, our branching
strategy, and the release process.

## Getting Started

```bash
git clone https://github.com/techninja/asili.git
cd asili
pnpm install
pnpm run dev
```

See the [README](README.md#local-development) for full setup including data
pipeline integration.

## Branch Strategy

```
main ─────────────────────────────── production (app.asili.dev/beta)
  ↑ merge PR (squash)                  auto-deploys on push
  │
dev ──────────────────────────────── integration (preview URL)
  ↑ merge PR                           auto-deploys on push
  │
feature/xyz ─────────────────────── your working branch
hotfix/xyz ──────────────────────── urgent fix (branches from main)
```

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Stable production | app.asili.dev/beta |
| `dev` | Integration & testing | Cloudflare preview URL |
| `feature/*` | New features | — (local only) |
| `hotfix/*` | Urgent production fixes | — (merged to main directly) |

### Default branch: `dev`

All PRs target `dev` by default. This is where features are integrated and
tested before promotion to `main`.

## Workflow

### Features

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# ... work ...

git push -u origin feature/my-feature
# Open PR → dev
# CI runs tests + spec check
# Review & merge
```

### Hotfixes (production is broken)

```bash
git checkout main
git pull origin main
git checkout -b hotfix/fix-description

# ... minimal fix ...

git push -u origin hotfix/fix-description
# Open PR → main (bypasses dev)
# CI runs tests
# Merge → auto-deploys immediately
# Then merge main back into dev:
git checkout dev && git merge main && git push
```

### Releasing

When `dev` is stable and tested:

1. Open PR from `dev` → `main`
2. Review the diff — this is everything shipping
3. Merge (squash recommended for clean history)
4. Tag the release:

   ```bash
   git checkout main && git pull
   git tag v1.2.0
   git push origin v1.2.0
   ```

5. The `release.yml` workflow creates a GitHub Release automatically
6. Write release notes (see `docs/RELEASE_v*.md` for examples)

### Version numbering

We use [semver](https://semver.org/):

- **Patch** (`1.1.1`) — bug fixes, typos, CSS tweaks
- **Minor** (`1.2.0`) — new features, UI improvements, new traits
- **Major** (`2.0.0`) — breaking changes (data format, API, URL structure)

## CI / Automation

Every PR gets:

- ✅ **Node tests** — 185 unit tests (`pnpm run test:node`)
- ✅ **Spec compliance** — Clearstack file limits, naming, structure
- ✅ **Lint** — ESLint + Stylelint (warnings, not blocking yet)

Every push to `main` or `dev`:

- 🚀 **Auto-deploy** to Cloudflare Pages

Every version tag (`v*`):

- 📦 **GitHub Release** created with auto-generated notes

## Code Style

- **No build step** — ES modules, import maps, no bundler
- **Web Components** via Hybrids.js — functional, no class syntax
- **Vanilla CSS** with custom properties — no preprocessor
- **Clearstack spec** — components defined in `docs/app-spec/` before implementation
- **File limits** — 150 lines for code, 300 for tests, 500 for docs
- **Minimal comments** — code should be readable without them
- **No PII** — never log, store, or transmit user genomic data

## Architecture

```
src/
├── components/
│   ├── atoms/          # Smallest reusable pieces
│   ├── molecules/      # Composed from atoms
│   └── organisms/      # Complex, page-level sections
├── pages/              # Route-level views
├── store/              # AppState (localStorage-backed)
├── utils/              # Scoring queue, manifest, categories
├── router/             # Hybrids router shell
└── styles/             # Design tokens, layout, transitions
```

Key modules:

- `src/utils/score-trait.js` — Range request streaming, tar parsing, DuckDB scoring
- `src/utils/queue-state.js` — Global scoring state, pub/sub
- `src/components/molecules/floating-bar/` — Persistent scoring UI
- `packages/core/` — Shared scoring logic (DuckDB adapter, scorer, normalizer)

## Data Pipeline

Trait data lives in [asili-lab](https://github.com/techninja/asili-lab). This
repo (asili) is the browser app only. To add/modify traits, work in asili-lab
and redeploy data to R2.

## Questions?

Open an issue or start a discussion. This project is maintained on weekends
by a solo developer with twins — patience appreciated, PRs very welcome.
