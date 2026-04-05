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

## What This Will Be

Asili is a free, open-source app where you upload your consumer DNA file
(23andMe, AncestryDNA, etc.) and get polygenic risk scores for dozens of
traits — entirely in your browser. No server, no accounts, no data leaves
your device.

- **44 curated traits** at launch (BMI, height, chronotype, caffeine metabolism, and more)
- **DuckDB WASM** scores your variants against published GWAS data client-side
- **Family comparison** — upload multiple family members and compare side by side
- **Zero data collection** — no analytics, no cookies, no tracking

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
pnpm run dev       # Start dev server on :3000
pnpm test          # Run tests
pnpm run spec      # Spec compliance checker
```

## Build Order

See [`docs/app-spec/PROMPT_ASILI_APP.md`](docs/app-spec/PROMPT_ASILI_APP.md)
for the full phased build plan. Each phase must pass its tests before the next.

1. Core scoring library (pure functions, no DOM)
2. Data layer (IndexedDB + DuckDB WASM adapter)
3. DNA parser (Web Worker, format auto-detection)
4. Atoms + store (base UI components)
5. Upload flow (first working feature)
6. Scoring + trait grid
7. Trait detail + family comparison
8. Reports + radar chart

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
