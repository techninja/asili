# Asili Tier & Build Architecture

## Philosophy

Asili is a free, open-source genomic risk analysis tool. The app ships with all features — no gating, no subscriptions, no premium tiers. Revenue comes from a single paid service: cloud imputation ($7.99) that dramatically improves data quality.

The core mathematical engine makes no distinction between tiers. The only difference is which trait packs are deployed to the public CDN vs available in the self-hosted version.

---

## The Master Catalog

The ETL pipeline compiles the **Master Catalog**: every viable trait from the PGS Catalog, processed with allele-aware matching and TOPMed normalization. Stored in `trait_manifest.db`, exported as `trait_manifest.json`.

The `trait_overrides.json` provides editorial names, descriptions, emojis, and phenotype data. The pipeline database is the source of truth for what's available. The allowlists control what's deployed.

**Rule:** The unfiltered Master Catalog (600+ traits including disease risks) is never deployed to the public CDN.

---

## The Two Deployments

### Public App (app.asili.dev) — Free

The publicly accessible static SPA. Zero server, zero accounts, zero data collection.

|                |                                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Audience**   | General public, 23andMe/Ancestry customers                                      |
| **Deployment** | Static CDN (S3+CloudFront)                                                      |
| **Processing** | Browser-only — DuckDB WASM via Web Workers                                      |
| **Data**       | ~44 curated benign traits, streamed via HTTP Range Requests                     |
| **Imputation** | None — raw genotype coverage only (~2-5%)                                       |
| **Auth**       | None                                                                            |
| **Cost**       | Free                                                                            |
| **Features**   | All features: scoring, family comparison, reports, radar charts, variant detail |

**Trait scope — strictly benign, anthropometric, and lifestyle:**

| Category       | Examples                                                       |
| -------------- | -------------------------------------------------------------- |
| Body           | BMI, height, body weight, waist circumference, waist-hip ratio |
| Metabolism     | Basal metabolic rate, carbohydrate intake, alcohol consumption |
| Cardiovascular | Heart rate, systolic blood pressure, diastolic blood pressure  |
| Lifestyle      | Chronotype, smoking status, neuroticism score                  |
| Appearance     | Male pattern baldness, suntan response                         |
| Nutrition      | Vitamin D level, vitamin B12 level                             |
| Reproductive   | Age at menarche, age at menopause                              |

These are traits where the result is interesting conversation, not medical anxiety.

**What users see before uploading DNA:**

- All 44 trait cards in "teaser" state with emoji, name, description
- "Upload your DNA to see your scores" prompt
- Link to marketing site explaining DNA sources and imputation

**What users see after uploading:**

- Scores for all 44 traits (2-5% coverage, with confidence indicators)
- Family comparison when multiple individuals uploaded
- Category radar chart, printable report
- Imputation upsell: "Your DNA covers 3% of variants. Get 80%+ coverage for $7.99 →"

### Self-Hosted (Docker) — Free, Open Source

The full engine running on the user's own hardware. All 600+ traits, local imputation, hybrid server scoring.

|                |                                                                |
| -------------- | -------------------------------------------------------------- |
| **Audience**   | Researchers, biohackers, privacy purists, self-hosters         |
| **Deployment** | Docker Compose on user's machine                               |
| **Processing** | Hybrid — server-side DuckDB native + optional local imputation |
| **Data**       | Full Master Catalog (600+ traits)                              |
| **Imputation** | Local Beagle 5.4 + TOPMed panel                                |
| **Auth**       | None (local)                                                   |
| **Cost**       | Free (AGPLv3)                                                  |

```bash
docker compose up -d
pnpm etl                          # Build all trait packs
pnpm imputation setup-topmed      # Download TOPMed panel (150GB)
pnpm imputation impute            # Impute user DNA
# All traits available, no restrictions
```

---

## The Paid Service: Cloud Imputation

The only revenue stream. A standalone service (separate private repo) that bridges the gap between sparse genotyped data (2-5% coverage) and imputed data (60-80% coverage).

|                   |                                                                               |
| ----------------- | ----------------------------------------------------------------------------- |
| **Price**         | $7.99 one-time                                                                |
| **What they get** | Imputed variant file (~20-40MB parquet), theirs forever                       |
| **Processing**    | Ephemeral EC2 with TOPMed panel, ~2-3 hours                                   |
| **Privacy**       | Client-side AES-256-GCM encryption before upload, server never sees plaintext |
| **Delivery**      | Download link via email, import into browser app                              |
| **Compute cost**  | ~$2.09 per job (~74% margin)                                                  |

See `CLOUD_IMPUTATION_TODO.md` for full technical spec.

**The pitch:** "Your DNA file covers 3% of the variants these scores need. For $7.99, we impute the missing 97% using the same reference panel used by major research institutions. Your data is encrypted before it leaves your browser. You get back a file that works offline, forever."

**After imputation, the user:**

1. Downloads their imputed parquet
2. Imports it into the same free app at app.asili.dev
3. All 44 traits re-score with 80%+ coverage
4. Results go from "low confidence" to "high confidence"
5. The file lives in their browser's IndexedDB — works offline

---

## What We're NOT Selling

- ❌ Access to more traits (self-hosted gives you all 600+ for free)
- ❌ Subscriptions or recurring payments
- ❌ Premium features (reports, charts, family comparison are all free)
- ❌ The data itself (PGS Catalog is public)
- ❌ Ongoing access to anything (one-time purchase, file is yours)

**We're selling compute.** Imputation requires 150GB of reference data, 16GB RAM, and 2-3 hours of CPU time. Most people don't have that setup. We do it for $8.

---

## Allowlist System

### Directory Structure

```
allowlists/
├── tier1_public.json        # ~44 curated benign traits
├── tier2_researcher.json    # Full Master Catalog ("*" wildcard)
└── README.md                # Curation guidelines
```

### How Filtering Works

The allowlist is applied at build time:

```
ETL Pipeline
    │
    ▼
Master Catalog (trait_manifest.db) ── all traits
    │
    ├── ASILI_TIER=tier1_public ──▶ Public CDN (~44 traits)
    └── ASILI_TIER=tier2_researcher ──▶ Local Docker (all traits)
```

The `tier2_researcher` allowlist uses `"*"` wildcard — it includes everything. It's used for the self-hosted Docker build, not for a paid tier.

### Public Trait Curation Guidelines

A trait belongs in the public app **only** if ALL of the following are true:

- ✅ It describes a **measurable physical characteristic** or **lifestyle tendency** (not a disease)
- ✅ Learning your score would be **interesting or fun**, not distressing
- ✅ It has **no medical diagnostic implications**
- ✅ It would **not** cause a reasonable person to seek medical attention based solely on the score
- ✅ It does **not** fall under FDA medical device definitions

---

## Revenue Model

| Source           | Price          | Margin | Volume Driver                         |
| ---------------- | -------------- | ------ | ------------------------------------- |
| Cloud imputation | $7.99 one-time | ~74%   | Free app users who want better scores |

### Projections (Conservative)

| Metric               | Month 1 | Month 6 | Month 12 |
| -------------------- | ------- | ------- | -------- |
| Free app users       | 100     | 1,000   | 5,000    |
| Imputation purchases | 5       | 50      | 200      |
| Monthly revenue      | $40     | $400    | $1,600   |

The funnel: free app → see low-confidence scores → imputation upsell → $7.99 purchase → dramatically better results → tell friends.

---

## Regulatory Notes

- **Public app** is insulated from FDA medical device definitions. No disease traits, no diagnostic claims. Benign traits only.
- **Self-hosted** carries zero liability — open-source code, public data, user's own hardware.
- **Cloud imputation** is a compute service, not a diagnostic tool. The Researcher Agreement (required before purchase) establishes informed consent and disclaims medical advice.
- **None of the tiers** make diagnostic claims. All results are presented as "polygenic risk scores from published research" with caveats about population stratification, coverage limitations, and the probabilistic nature of PGS.

---

## Why AGPLv3

- Prevents proprietary forks — anyone who modifies Asili must share their changes
- Network copyleft — if you run a modified version as a web service, you must provide source code
- Protects the community — ensures improvements benefit everyone
- Commercial use allowed — you can charge for services, but must keep code open source
- The cloud imputation service is a separate private repo (not a fork of Asili), so it's not subject to AGPLv3
