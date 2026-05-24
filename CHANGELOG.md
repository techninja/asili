# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] — 2025-05-22

### Added

- Per-chromosome Range request streaming — downloads each chromosome individually instead of the full .asili archive
- Automatic retry with backoff on transient network errors
- Bandwidth throttle setting (5–500 Mbps) for mobile data users
- Real-time data consumption display (MB/min rolling average)
- Transfer tracking persisted to IndexedDB per individual
- Floating bar expandable detail panel with per-individual breakdown
- Sub-progress bar for chromosome/DNA loading progress
- Spinning badge animation on pause button, octagon-pause status icon
- Blocked state in floating bar with unlock button for file permissions
- Individual progress cards with animated background fill
- Single-individual compact header layout
- Fullscreen state sync with browser
- Report component subscribes directly to queue state
- Settings: bandwidth limit, DuckDB deps deploy with MIME types
- Upload zone double-picker fix for Android
- Sticky header wrapper (header + sub-header as single unit)
- FLIP width animation for smooth bar resizing
- Mobile CSS grid layout for floating bar
- Trait showcase on landing page links to trait detail pages

### Fixed

- Settings storage calculation no longer locks main thread
- Result count syncs correctly on rescore
- Upload panel layers above sub-header
- Dev mode detection for LAN hostnames
- Unified isDev export (single source of truth)

### Changed

- Replaced emoji icons with Lucide SVG icons throughout floating bar
- Data rate display changed from Mbps to MB/min (more useful for mobile users)
- Paused state uses non-interactive status icon + green resume button
- Report shows empty state when no results instead of stale data

## [1.0.0] — 2025-05-01

### Added

- Initial beta launch at app.asili.dev/beta
- 64 traits scored against PGS Catalog data
- 8 individuals tested simultaneously
- DuckDB WASM browser-only scoring with pause/resume
- Trait grid with search, sort, filter by category
- Trait detail with bell curve, waterfall, PGS quality breakdown
- Quantitative predicted values from z-scores
- Family comparison across all traits
- Printable reports with radar chart
- Emoji avatar builder
- Settings: export/import/clear data, ancestry normalization, units
- Zero data collection — no analytics, cookies, or tracking
- IndexedDB persistence
- Cloudflare Pages + R2 deployment

## [0.x] — 2024-11 to 2025-04

Buildout from [asili-lab](https://github.com/techninja/asili-lab) learnings.
See the `buildout` branch history for the full ride from research prototype to
production app.

### Highlights

- Ported scoring logic from Python/CLI to browser-native DuckDB WASM
- Designed .asili tar format for streaming per-chromosome parquet delivery
- Built allele-aware variant matching with deterministic `allele_key` hashing
- Validated PGS quality scoring against 647 traits × 3 individuals
- Developed Clearstack spec-driven architecture (no build step, ES modules)
- Iterated through 3 UI frameworks before landing on Hybrids.js web components
- Proved full imputation pipeline (Eagle2 + Beagle 5.4 + TOPMed panel)
- Established privacy-first architecture — zero server-side processing
