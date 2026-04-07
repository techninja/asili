<p align="center">
  <img src="assets/logo.svg" alt="asili" width="300">
</p>

<p align="center">
  <em>Swahili for "Root"</em> — Privacy-first polygenic risk score analysis.<br>
  All processing happens on your device.
</p>

<p align="center">
  <a href="https://asili.dev">Website</a> ·
  <a href="https://app.asili.dev">App (coming soon)</a> ·
  <a href="docs/app-spec/">Specification</a>
</p>

---

## 🚧 Closed for Input — Rebuild in Progress

This repo is being built from spec. The full application specification lives in
[`docs/app-spec/`](docs/app-spec/) and was validated in the
[asili-lab](https://github.com/techninja/asili-lab) experimental repo across
3 individuals × 647 traits.

**Contributions and issues are not being accepted until the rebuild is complete.**
Watch the repo or check [app.asili.dev](https://app.asili.dev) for progress.

---

## What This Is

Asili is a free, open-source app where you upload your consumer DNA file
(23andMe, AncestryDNA, etc.) and get polygenic risk scores for hundreds of
traits — entirely in your browser. No server, no accounts, no data leaves
your device.

### Working Features

- **Upload & parse** — drag-and-drop DNA files with auto-format detection (23andMe, AncestryDNA, MyHeritage, FTDNA, VCF)
- **Emoji avatar builder** — pick gender, skin tone, and style for each individual
- **DuckDB WASM scoring** — scores variants against published GWAS data client-side in a Web Worker with abort support
- **Trait grid** — search, sort (name/percentile/confidence), filter by category, grouped with persistent collapse state
- **Trait detail** — percentile bar, PGS comparison table, risk/protective balance, coverage indicator, family comparison
- **Family comparison** — upload multiple family members and compare side by side
- **Printable reports** — category radar chart, top elevated/below average traits
- **Settings** — export/import/clear-all data
- **Zero data collection** — no analytics, no cookies, no tracking
- **IndexedDB persistence** — results survive page reloads

## Architecture

```
src/
├── components/
│   ├── atoms/          # percentile-bar, confidence-badge, theme-toggle, etc.
│   ├── molecules/      # trait-card, upload-zone, emoji-builder, pgs-table, etc.
│   └── organisms/      # trait-grid, radar-chart
├── pages/
│   ├── home/           # Landing page
│   ├── beta/           # Main app view (individual switcher + trait grid)
│   ├── trait-detail/   # Single trait deep-dive
│   ├── report/         # Printable genomic report
│   └── settings/       # Data management
├── store/              # AppState (Hybrids store, localStorage-backed)
├── workers/            # scoring-worker.js (DuckDB WASM)
├── utils/              # manifest, scoring, categories, formatDate
├── router/             # Hybrids router shell
└── styles/             # Design tokens, reset, shared CSS
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
pnpm run dev          # Start dev server
pnpm test             # Run browser tests (web-test-runner)
node --test            # Run node tests
pnpm spec check all   # Spec compliance checker (9 checks)
```

## Privacy

- **No data collection** — we never see, store, or transmit your genomic data
- **Browser-only processing** — all scoring runs locally via DuckDB WASM
- **Open source** — full transparency in how your data is processed
- **Your data, your device** — results stay in your browser's IndexedDB

## License

AGPLv3 — See [LICENSE](LICENSE) for details.

- ✅ Use freely for personal or commercial purposes
- ✅ Modify and improve the code
- ✅ Run it as a service for others
- ❌ Create a proprietary closed-source version
- ❌ Hide your modifications from users
