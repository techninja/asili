## Development Plan: Local-Only DNA Research Tool

**Goal:** Build a privacy-first genomic research tool where user data never leaves the browser, powered by a "Data Lakehouse" architecture using DuckDB WASM and Parquet.

**Core Philosophy:**

1. **Privacy:** User DNA is read locally. It is never uploaded.
2. **Performance:** Range requests fetch only necessary science data.
3. **TDD:** Tests are written before features to ensure stability.
4. **Automation:** GitHub Actions handle linting, testing, and deployment.

## Phase 1: The "Walking Skeleton" (Architecture Validation)

**Objective:** Prove the end-to-end flow locally: Pipeline -> CDN -> Browser -> DuckDB Query.

### 1.1 Repo & Monorepo Structure

Establish a clean directory structure to separate concerns.

- `apps/web`: Web Components Frontend (Static hosting).
- `packages/pipeline`: Python ETL scripts.
- `packages/shared`: Shared types/constants.
- `infra/`: Docker & Deployment config.

### 1.2 Testing Infrastructure (TDD Setup)

- **Frontend:** Write tests for web components using Web Test Runner.
  - _Task:_ Create a failing test for a `DuckDBProvider` class.
- **Pipeline:** Install `pytest`.
  - _Task:_ Create a failing test that checks if a generated Parquet file has the correct schema.

### 1.3 The Core Loop (MVP)

- **Pipeline:** Write the Python script to generate a valid `Alzheimers_Risk.parquet` with dummy data.
  - _Pass Criteria:_ Pytest validates column types and ZSTD compression.

- **Docker:** Configure Nginx to serve this file with `Access-Control-Allow-Origin` and `Access-Control-Expose-Headers: Content-Length, Content-Range`.

- **Frontend:** Implement `DuckDBProvider` class.
  - _Pass Criteria:_ Web Test Runner confirms the class returns a ready connection.
  - _Feature:_ Query the Parquet file via HTTP from the web components app.

## Phase 2: The Science Pipeline (Data Engineering)

**Objective:** Hardening the data generation to ensure scientific accuracy and query performance.

### 2.1 Schema Validation & Type Safety

- **TDD:** Write a test that rejects input data with missing columns or invalid chromosome names (e.g., "23" instead of "X").
- **Implementation:** Use `Pydantic` or `Pandas` schema validation in the ETL script.

### 2.2 Sorting & Optimization

- **Performance:** DuckDB performs best with **Merge Joins**.
- **TDD:** Write a test asserting that output Parquet files are sorted by `chr` (natural sort) -> `pos`.
- **Implementation:** Implement the sort logic in Python before writing to Parquet.

### 2.3 Automating Updates

- **CI/CD:** Create a GitHub Action `data-pipeline.yml`.
  - _Trigger:_ Weekly schedule or manual dispatch.
  - _Action:_ Pulls from PGS Catalog, runs tests, builds Parquet, uploads to Staging Bucket.

## Phase 3: The User Experience (Client-Side Parsing)

**Objective:** allowing users to drag-and-drop their 23andMe/Ancestry files.

### 3.1 DNA File Parsing (Web Workers)

- **Challenge:** Parsing 20MB text files freezes the UI.

- **TDD:**
  - Create `parser.test.ts` with a mock 23andMe text string.
  - Assert it returns a structured ArrayBuffer/Arrow Table.

- **Implementation:** Build a Web Worker to stream-parse the file into a local DuckDB table.

### 3.2 Persistence (IndexedDB)

- **Goal:** User only uploads once.
- **TDD:** Test that data survives a page reload using `fake-indexeddb`.
- **Implementation:** Configure DuckDB WASM to persist the imported table to OPFS (Origin Private File System) or IndexedDB.

### 3.3 Visualization Components

- **TDD:** Snapshot tests for `risk-card` and `manhattan-plot` web components.
- **Implementation:** Build UI to display "Your Risk: 1.2x" vs "Average".

## Phase 4: Business Model (Auth & Payments)

**Objective:** Gate premium "Trait Packs" (e.g., "Elite Athletics Pack") while keeping the engine Open Source.

### 4.1 Authentication

- **Choice:** Firebase Auth (easiest integration) or Supabase.
- **Implementation:** Add "Login" button. User ID is used _only_ for subscription status, not for DNA storage.

### 4.2 Secured CDN (Signed URLs)

- **Architecture:**
  - Public Packs (Free): `cdn.example.com/free/caffeine.parquet`
  - Private Packs (Paid): `cdn.example.com/premium/athletics.parquet` (403 Forbidden by default).

- **TDD:** Integration test where an unauthenticated request returns 403, and a signed URL returns 200.

- **Implementation:**
  - Use CloudFront (AWS) or Firebase Hosting.
  - Write a Cloud Function: `generate_signed_url(user_id, file_path)`.
  - Frontend calls function -> gets temp URL -> passes to DuckDB.

### 4.3 Stripe Integration

- **Flow:** User clicks "Buy Pack" -> Stripe Checkout -> Webhook -> Updates User Claims in Firebase.

## Phase 5: CI/CD & Deployment

**Objective:** Automate the path to production.

### 5.1 GitHub Actions Workflows

1. `ci-web.yml`: Runs on every PR to `main`.
   - `npm ci`
   - `npm run build` (copies static files)
   - Web Test Runner for component tests

2. `ci-pipeline.yml`: Runs when `packages/pipeline` changes.
   - `pytest`
   - `flake8` (Python linting)

### 5.2 Deployment Environments

- **Staging:**
  - Web: `staging.dna-app.com` (S3 + CloudFront static hosting).
  - Data: S3 Bucket `dna-data-staging`.

- **Production:**
  - Triggered by Creating a Release Tag in GitHub.
  - Promotes Staging build to Prod.

## Phase 6: Open Source Strategy

**Objective:** Open source the _Engine_, sell the _Data curation_.

1. **Repository:** Public GitHub repo.

2. **License:** AGPLv3 (Engine) to ensure improvements are shared.

3. **Data separation:**
   - The `pipeline/` code is public.
   - The _configuration_ for premium packs (specific weights, proprietary curation) is in a private repo or env variables.

4. **Community:** Add `CONTRIBUTING.md` allowing users to submit PRs for new _public_ traits (e.g., "I added a parser for MyHeritage files").
