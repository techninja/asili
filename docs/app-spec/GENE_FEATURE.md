# Gene Feature — Browser, Detail, Table, Report

## Overview

A "Genes" tab on the main beta app interface allowing users to search and browse
well-known named genes (BRCA1, MTHFR, APOE, etc.) — the kind people hear about
on social media. The feature bridges the gap between popular genetics awareness
and our polygenic scoring pipeline.

For most sparse-array users, their uploaded data won't contain variants at these
specific loci. The gene pages make this visible and lead users toward our
imputation pipeline at `impute.asili.dev`.

---

## Status

### ✅ Shipped (v2)

- **Data pipeline** — `asili-lab/scripts/build-gene-catalog.js`
  - Downloads NCBI gene_info + gene2pubmed bulk files
  - Ranks all 20K+ human protein-coding genes by publication count
  - Takes top 200, enriches with curated social context for ~50 key genes
  - Fetches gene details from NCBI esummary API (summary, aliases, exon count, OMIM IDs)
  - Merges editorial overrides from `asili-lab/data/gene_overrides.json`
  - Outputs `data_out/gene_catalog.json` (238KB, 199 genes)
  - Cached for offline rebuilds (`--offline` flag)
  - Data sources referenced in output JSON
- **Genes tab** — searchable gene card grid in beta view
  - Fuzzy search on symbol, name, social_tags, aliases
  - Category filter chips (12 categories)
  - Sort: Position (genome order), Name, Studies, Category with direction toggle
  - Card shows: emoji, symbol, chromosome, name, social tags, category badge, pub count
  - Position-based hue coloring on card left border (rainbow across genome)
  - Keyboard navigation (vim h/j/k/l + arrow keys) on detail pages
- **Gene detail page** — routable at `/gene/:symbol`
  - Hero: emoji, symbol, full name, chromosome position, category, publications
  - Vertical chromosome rail (sticky sidebar):
    - Variant density strip (log-scaled, amber palette)
    - All sibling genes on same chromosome as labeled ticks
    - SVG connector lines with collision-avoidance lanes
    - Hover highlight animation on tick positions
    - Clickable gene labels for navigation
    - Animated scan line for raw users
  - Your Data section (per-individual):
    - Individual name + emoji in header
    - Per-gene stats: total variants, non-reference count, genotyped count
    - Key variant matching with rsID badges
    - Impute CTA with personalized language
    - Hidden when no data available
  - Gene Info: gene length, exon count, key variants, PubMed citations, cytogenetic band
  - About This Gene:
    - Editorial content (description, what it does, carrier context, actionability, fun fact)
    - NCBI summary (collapsible when editorial exists)
    - Aliases chip row
  - Learn More: Wikipedia, NCBI Gene, OMIM links
  - Floating bar with prev/next gene navigation
  - Keyboard prev/next (vim + arrows)
  - Individual switcher in header
  - Breadcrumb back to Genes tab
- **Gene table** — sub-tab in Table view
  - Sortable columns: Gene, Chr, Category, Studies, Variants, Non-ref
  - Clickable rows navigate to gene detail
  - Per-individual stats from profile when available
- **Individual profiling** — `src/utils/individual-profile.js`
  - Extracts per-gene stats (total/imputed/genotyped/nonref) during scoring
  - Extracts DR2 bins + region coverage for chromosome visualization
  - Persists to IDB under `profile:{individualId}`
  - "Rebuild Profiles" button in settings for backfill
  - Works for both raw (variant array) and imputed (DuckDB query) users
- **Editorial overrides** — `asili-lab/data/gene_overrides.json`
  - 8 genes seeded: BRCA1, APOE, MTHFR, COMT, FTO, TP53, FOXO3, MTOR
  - Fields: emoji, editorial_description, what_it_means, carrier_note,
    nonref_interpretation, clinical_significance, actionability, fun_fact,
    related_trait_ids

### 🔜 Next Phase

- **Report integration** — compact "Notable Genes" section in the printable report
  (3-4 genes with editorial overrides: emoji + symbol + one-liner)
- **Related traits** — link gene detail to overlapping scored traits via related_trait_ids
- **Variant genotype display** — show actual alleles for matched popular_variants
- **Deploy integration** — add `gene_catalog.json` to `deploy-data.js` for R2
- **Social share metadata** — OG tags for gene pages
- **Imputation quality fix** — replace custom DR2 formula with max GP
  (see `asili-lab/docs/FIX_IMPUTATION_QUALITY.md`)
- **More editorial overrides** — expand from 8 to 50+ genes in batches

---

## Architecture

### Data Flow

```
NCBI gene_info.gz ──┐
                    ├──→ build-gene-catalog.js ──→ gene_catalog.json ──→ R2/CDN
NCBI gene2pubmed.gz ┘         ↑         ↑
                        NCBI esummary   gene_overrides.json
                        (hg38 coords,   (editorial content)
                         summary, etc.)
```

### File Map

```
asili-lab/
├── scripts/build-gene-catalog.js    # Pipeline script
├── data/gene_overrides.json         # Editorial overrides (8 genes)
├── cache/ncbi_genes/                # Cached downloads + API responses
│   ├── gene_details.json            # esummary API cache
│   └── *.gz                         # NCBI bulk files
├── data_out/gene_catalog.json       # Output (symlinked to frontend)
└── docs/FIX_IMPUTATION_QUALITY.md   # DR2 formula fix spec

asili/
├── src/utils/gene-catalog.js        # Fetch + cache loader
├── src/utils/individual-profile.js  # Profile extraction (DR2, coverage, gene stats)
├── src/utils/dr2-bins.js            # DR2 accessor (reads from profile)
├── src/utils/keyboard-nav.js        # Unified keyboard navigation
├── src/components/organisms/explore-grid/
│   ├── explore-grid.js              # Search + sort + card grid
│   └── explore-grid.css
├── src/components/organisms/gene-table/
│   ├── gene-table.js                # Sortable gene table
│   └── gene-table.css
├── src/pages/gene-detail/
│   ├── gene-detail-view.js          # Routable page (/gene/:symbol)
│   ├── gene-detail-init.js          # Data loading + variant lookup
│   └── gene-detail-view.css
├── src/pages/beta/
│   ├── beta-render.js               # Tab + sub-tab rendering
│   └── beta-view.js                 # Route stack + properties
└── src/components/organisms/settings-drawer/
    └── drawer-profiles.js           # Rebuild Profiles handler
```

### Routing

```
HomeView (/)
└── BetaView (/beta)
    ├── TraitDetailView (/trait/:traitId)
    └── GeneDetailView (/gene/:symbol)
```

---

## Gene Catalog Schema (v1.1)

```json
{
  "version": "1.1",
  "generated_at": "2026-06-27T...",
  "gene_count": 199,
  "categories": ["Appearance", "Brain & Mood", ...],
  "sources": {
    "canonical": "https://data.asili.dev/gene_catalog.json",
    "gene_info": "https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/...",
    "gene2pubmed": "https://ftp.ncbi.nlm.nih.gov/gene/DATA/gene2pubmed.gz",
    "coordinates": "NCBI Entrez esummary API (hg38)",
    "overrides": "asili-lab/data/gene_overrides.json"
  },
  "genes": [
    {
      "symbol": "BRCA1",
      "name": "BRCA1 DNA repair associated",
      "chr": "17",
      "start": 43044294,
      "end": 43170326,
      "build": "hg38",
      "publications": 3454,
      "summary": "This gene encodes a 190 kD nuclear phosphoprotein...",
      "aliases": ["BRCC1", "FANCS", "RNF53"],
      "exon_count": 31,
      "mim_ids": ["113705"],
      "map_location": "17q21.31",
      "social_tags": ["breast cancer", "hereditary", "Angelina Jolie"],
      "category": "Cancer Risk",
      "popular_variants": ["rs80357906", "rs80357713"],
      "related_traits": [],
      "wikipedia_slug": "BRCA1",
      "emoji": "🎀",
      "editorial_description": "One of the most studied cancer genes...",
      "what_it_means": "BRCA1 is a tumor suppressor...",
      "carrier_note": "Pathogenic mutations are rare...",
      "nonref_interpretation": "Most non-reference variants are benign...",
      "clinical_significance": "high",
      "actionability": "Carriers should discuss screening...",
      "fun_fact": "BRCA1 is enormous — 81kb..."
    }
  ]
}
```

---

## Report Integration Spec

### "Notable Genes" Section

**Position:** Between "Category Breakdown" and "Top Elevated"

**Content:** 3-4 genes from the catalog that have editorial overrides,
selected by relevance to the individual (e.g., genes where they have
non-reference variants, or highest publication count).

**Layout:** Compact single row, print-friendly:
```
🎀 BRCA1 — Tumor suppressor, hereditary breast cancer  |  🥬 MTHFR — Folate metabolism  |  ⚡ COMT — Dopamine clearance
```

Each entry: emoji + symbol + one-line editorial_description (truncated).
Clickable in browser, plain text in print.

**Selection logic:**
1. Filter catalog to genes with editorial overrides
2. If individual has profile geneStats, prefer genes with nonref > 0
3. Fall back to highest publication count
4. Take top 3-4

---

## Open Questions

- [ ] Should related_traits be computed at build time or runtime?
- [ ] Should the gene table support column customization like the trait table?
- [ ] Should we add OG image generation for gene pages?
- [ ] What to cut from Report to keep it 1-page when Notable Genes is added?
