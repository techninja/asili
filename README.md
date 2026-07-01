<p align="center">
  <img src="assets/logo.svg" alt="asili" width="300">
</p>

<p align="center">
  <em>Swahili for "Root"</em> — Privacy-first polygenic risk score analysis.<br>
  All processing happens on your device.
</p>

<p align="center">
  <a href="https://asili.dev">Website</a> ·
  <a href="https://app.asili.dev">App</a> ·
  <a href="https://beta.asili.dev">Beta</a> ·
  <a href="docs/app-spec/">Specification</a>
</p>

---

## 🧬 Deployments

| Environment | URL | Branch | Purpose |
| ----------- | --- | ------ | ------- |
| Production | [app.asili.dev](https://app.asili.dev) | `main` | Stable releases for end users |
| Beta | [beta.asili.dev](https://beta.asili.dev) | `dev` | Preview of in-progress work — auto-deploys on every push |

The app lets you upload a consumer DNA file (23andMe, AncestryDNA, etc.) and
explore polygenic risk scores for 64 traits — entirely in your browser. No
server, no accounts, no data leaves your device.

**Currently shipping:**

- 64 traits scored against published PGS Catalog data
- 8 individuals tested simultaneously
- Quantitative predicted values (BMI, height, blood markers, etc.)
- Metric/imperial unit switching

**Next phase:** Rebuild of the [asili-lab](https://github.com/techninja/asili-lab)
data pipeline to expand from 64 to 647+ traits, improve normalization parameters,
and add ancestry-specific reference populations.

---

## What This Is

Asili is a free, open-source app where you upload your consumer DNA file
(23andMe, AncestryDNA, etc.) and get polygenic risk scores for hundreds of
traits — entirely in your browser. No server, no accounts, no data leaves
your device.

### Features

- **Upload & parse** — drag-and-drop DNA files with auto-format detection (23andMe, AncestryDNA, MyHeritage, FTDNA, VCF, .asili imputed)
- **Emoji avatar builder** — pick gender, skin tone, and style for each individual
- **DuckDB WASM scoring** — scores variants against published GWAS data client-side with pause/resume and progress tracking
- **Trait grid** — search, sort (name/percentile/confidence), filter by category
- **Trait detail** — bell curve with family comparison, top contributing variants waterfall, PGS quality breakdown
- **Predicted values** — quantitative output (e.g. "BMI: 24.3 kg/m²") computed from z-scores and population references
- **Family comparison** — upload multiple family members, compare side by side on every trait
- **Printable reports** — category radar chart, top elevated/below average traits
- **Floating scoring bar** — persistent progress indicator with pause/resume across all views
- **Settings** — export/import/clear-all data, ancestry normalization, metric/imperial units
- **Zero data collection** — no analytics, no cookies, no tracking
- **IndexedDB persistence** — results survive page reloads
- **Mobile-first** — responsive layout, touch-sized controls, bandwidth throttling for mobile data
- **Network resilience** — per-chromosome Range requests with automatic retry on transient errors

## Architecture

```
src/
├── components/
│   ├── atoms/          # mini-curve, confidence-badge, aqs-breakdown, speedometer
│   ├── molecules/      # trait-card, upload-zone, emoji-builder, floating-bar
│   └── organisms/      # trait-grid, data-table, radar-chart, scoring-screen
├── pages/
│   ├── home/           # Landing page (app.asili.dev)
│   ├── beta/           # Main app view (individual switcher + trait grid)
│   └── trait-detail/   # Single trait deep-dive
├── store/              # AppState (localStorage-backed)
├── utils/              # scoring queue, manifest, categories, storage
├── router/             # Hybrids router shell
└── styles/             # Design tokens, layout, transitions
```

## Tech Stack

| Layer     | Choice                          |
| --------- | ------------------------------- |
| UI        | Web Components (Hybrids.js)     |
| Build     | None (no-build, ES modules)     |
| Spec      | [Clearstack](https://github.com/techninja/clearstack) |
| DB        | DuckDB WASM (browser)           |
| CSS       | Vanilla CSS + custom properties |
| Package   | pnpm                            |
| Deploy    | Cloudflare Pages                |

## Quick Start

```bash
pnpm install
pnpm run sync small   # Sync data assets from data.asili.dev (~75 MB)
pnpm run dev          # Start dev server at http://localhost:4242
pnpm test             # Run all tests (node + browser)
```

## Local Development

This repo is the **browser scoring app**. Data assets are hosted on
[data.asili.dev](https://data.asili.dev) and synced locally for development.
The dev server serves local files first and falls back to the CDN for anything
not yet synced.

### Setup

1. Clone and install:

   ```bash
   git clone https://github.com/techninja/asili.git
   cd asili
   pnpm install   # also creates .env.local automatically
   ```

2. Sync data assets:

   ```bash
   pnpm run sync small   # ~75 MB — everything needed to run and score
   pnpm run sync all     # ~18 GB — full local mirror of all 64 trait packs
   ```

   | Command | What it fetches | Size |
   |---------|----------------|------|
   | `sync small` | manifest, norm params, hg19map, gene catalog, demo individuals, pgs_detail, DuckDB WASM | ~75 MB |
   | `sync all` | everything above + all 64 trait packs | ~18 GB |
   | `sync trait EFO_xxx` | single trait pack on demand | varies |

   With `sync small`, any trait pack not yet local is fetched from the CDN
   transparently at scoring time — no manual steps needed.

3. Start the dev server:

   ```bash
   pnpm run dev   # http://localhost:4242
   ```

### Working on the data pipeline

Trait data is generated by [asili-lab](https://github.com/techninja/asili-lab).
If you're working on the pipeline itself, clone both repos side by side and
symlink the output:

```bash
# ~/web/asili/       — this repo
# ~/web/asili-lab/   — data pipeline
ln -s ../asili-lab/data_out src/data
```

See the [asili-lab README](https://github.com/techninja/asili-lab) for pipeline
setup and data generation.

## Privacy

- **No data collection** — we never see, store, or transmit your genomic data
- **Browser-only processing** — all scoring runs locally via DuckDB WASM
- **Open source** — full transparency in how your data is processed
- **Your data, your device** — results stay in your browser's IndexedDB

## Roadmap

- [x] Frontend scoring rebuild (this repo)
- [x] Public launch at app.asili.dev
- [ ] Pipeline rebuild — expand to 647+ traits
- [ ] Ancestry-specific normalization improvements
- [ ] Imputation service rebuild (impute.asili.dev)

## License

AGPLv3 — See [LICENSE](LICENSE) for details.

- ✅ Use freely for personal or commercial purposes
- ✅ Modify and improve the code
- ✅ Run it as a service for others
- ❌ Create a proprietary closed-source version
- ❌ Hide your modifications from users
