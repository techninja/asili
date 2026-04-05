# Browser Scoring Performance

## How It Works

DuckDB WASM reads parquet files from the CDN using HTTP Range Requests. It does NOT download the entire file — it reads the parquet footer (metadata, a few KB), then fetches only the row groups needed for the query.

For scoring, the query is:

```sql
SELECT pgs_id, SUM(effect_weight * genotype_dosage) as score, COUNT(*) as matched
FROM '{cdn_url}' t
INNER JOIN _dna d ON t.chr = d.chr AND t.pos = d.pos AND t.allele_key = d.allele_key
GROUP BY pgs_id
```

The `_dna` table (user's variants) is in-memory. The parquet is remote. DuckDB WASM handles the Range Request orchestration internally.

## Performance by Pack Size

Tested with native DuckDB over HTTP (WASM will be ~3-5x slower):

| Pack Size   | Rows    | Native Time | Est. WASM Time | User Experience                     |
| ----------- | ------- | ----------- | -------------- | ----------------------------------- |
| < 1 MB      | < 100K  | < 100ms     | < 500ms        | Instant                             |
| 1-10 MB     | 100K-1M | 100-500ms   | 0.5-2s         | Fast                                |
| 10-100 MB   | 1-10M   | 0.5-3s      | 2-10s          | Acceptable                          |
| 100-500 MB  | 10-50M  | 3-10s       | 10-30s         | Show progress                       |
| 500 MB-2 GB | 50-120M | 10-30s      | 30-90s         | Show progress + "this is a big one" |

## Public App Pack Size Distribution

Current 44 public traits:

- 5 traits > 1 GB (BMI, height, blood pressure variants)
- 10 traits 100 MB - 1 GB
- 15 traits 10-100 MB
- 14 traits < 10 MB

Total: ~17.8 GB across 44 packs. The CDN serves them — the browser only downloads what the JOIN touches.

## Optimization Strategies

### 1. Score small packs first

Sort the scoring queue by pack size ascending. The user sees results appearing within seconds for small traits, building confidence while the big ones process in the background.

### 2. Parquet row group sizing

During ETL, write parquet files with row groups sorted by `chr, pos`. DuckDB can skip entire row groups when the filter doesn't match. Smaller row groups (e.g., 100K rows) mean more granular skipping but more Range Requests. Larger row groups (1M rows) mean fewer requests but more data per request.

Current: default DuckDB row group size. May need tuning.

### 3. Genotyped-only optimization

With only 700K genotyped variants (no imputation), the user's DNA covers ~2-5% of most PGS. The JOIN will match very few rows. The bottleneck is scanning the parquet to find those matches, not processing them.

For genotyped-only users, consider pre-filtering: extract the user's chr:pos set, and use it as a pushdown predicate. DuckDB WASM supports this via parquet row group statistics (min/max per column per row group).

### 4. Split large packs by chromosome

Instead of one 1.8GB BMI parquet, split into 22 per-chromosome files:

```
packs/EFO_0004340/chr1.parquet  (150MB)
packs/EFO_0004340/chr2.parquet  (140MB)
...
```

Score each chromosome independently, merge results. This enables:

- Parallel Range Requests (browser can fetch multiple chromosomes simultaneously)
- Progressive results ("Chromosome 1 scored... Chromosome 2 scored...")
- Smaller memory footprint per query

Trade-off: more files on CDN, more complex scoring orchestration.

### 5. Sparse array index (future)

Pre-compute a bloom filter or position index per pack that tells the browser "these row groups contain positions matching common genotyping arrays." Ship as a small sidecar file (~100KB per trait). The browser checks the index before making Range Requests, skipping row groups with zero matches.

## What This Means for the Product

### Free tier (browser-only, genotyped)

- Small traits: instant results, great experience
- Large traits: 30-90 seconds each, needs progress UI
- 44 traits total: 5-15 minutes for full scoring run
- Wake Lock + chunked resume handles mobile

### After imputation (browser with unified parquet)

- Same DuckDB WASM, but the `_dna` table has 70M variants instead of 700K
- More matches per trait = more data to process
- But coverage is 80%+ so results are meaningful
- Total scoring time: 10-30 minutes for 44 traits

### Hybrid server (self-hosted)

- Native DuckDB, 3-5x faster than WASM
- Parquet files are local (no Range Requests)
- 44 traits: 1-2 minutes
- 600+ traits: 30-60 minutes

## CDN Requirements

- S3 + CloudFront (or equivalent) with Range Request support
- CORS headers allowing the app domain
- Cache-Control: long TTL (packs change only on ETL rebuild)
- Total storage: ~18 GB for public app, ~200 GB for full self-hosted corpus
- Bandwidth: each user downloads ~50-500 MB depending on how many traits they score (Range Requests, not full files)

## Teaser Content (Pre-Upload)

Before the user uploads DNA, the app has no data to show. The trait grid should display:

- All 44 trait cards in "empty" state with emoji, name, description
- Each card shows: "Upload your DNA to see your score"
- Category grouping visible so users can browse what's available
- Tapping a card shows the trait description + "what this measures" + sample visualization
- Banner: "Have a 23andMe or AncestryDNA file? Upload it to get started →"
- Link to marketing site for "Where do I get my DNA file?" explainer
