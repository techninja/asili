# Pipeline Controller

Unified interface for running different pipeline modes via Docker.

## Quick Start

```bash
# Standard ETL pipeline
pnpm pipeline etl

# Download 1000 Genomes data (one-time, ~200GB)
pnpm pipeline empirical-setup

# Compute empirical distributions for all traits
pnpm pipeline empirical

# Compute for specific traits only
pnpm pipeline empirical --traits EFO_0005106,MONDO_0005010

# Compute for specific populations only
pnpm pipeline empirical --populations EUR,AFR
```

## Modes

### `etl`
Standard ETL pipeline that processes PGS Catalog data into Parquet files.
- Runs automatically on `docker compose up`
- Generates trait packs in `data_out/packs/`
- Updates `trait_manifest.json` and `manifest.duckdb`

### `empirical-setup`
Downloads 1000 Genomes Project Phase 3 data (~200GB).
- One-time setup required for empirical calculations
- Downloads to `./1000genomes/` directory
- Includes VCF files for chromosomes 1-22, X, Y
- Includes sample panel with population assignments

### `empirical`
Computes population-level PGS distributions from 1000 Genomes data.
- Requires `empirical-setup` to be run first
- Processes 2,504 reference genomes
- Generates mean/SD for z-score normalization
- Adds `empirical_stats` to trait manifest
- Takes hours to days depending on trait count

## Options

### `--traits <id1,id2>`
Process only specific trait IDs. Useful for:
- Testing empirical calculations on a few traits
- Recomputing distributions after trait updates
- Incremental processing

Example:
```bash
pnpm pipeline empirical --traits EFO_0005106,MONDO_0005010,EFO_0004229
```

### `--populations <pop1,pop2>`
Compute distributions for specific populations only. Options:
- `ALL` - All populations combined (n=2,504)
- `EUR` - European (n=503)
- `AFR` - African (n=661)
- `EAS` - East Asian (n=504)
- `SAS` - South Asian (n=489)
- `AMR` - American (n=347)

Example:
```bash
# Only compute for European and African populations
pnpm pipeline empirical --populations EUR,AFR
```

## Output

### ETL Mode
- `data_out/packs/*.parquet` - Trait-specific variant data
- `data_out/trait_manifest.json` - Trait metadata
- `data_out/manifest.duckdb` - Database version of manifest

### Empirical Mode
- `data_out/empirical_distributions.json` - Raw statistics
- `data_out/trait_manifest.json` - Updated with `empirical_stats`

Example manifest entry after empirical calculation:
```json
{
  "EFO_0005106": {
    "name": "type 2 diabetes mellitus",
    "empirical_stats": {
      "ALL": {"mean": 12.345, "sd": 4.123, "n": 2504},
      "EUR": {"mean": 13.102, "sd": 3.987, "n": 503},
      "AFR": {"mean": 11.234, "sd": 4.456, "n": 661}
    }
  }
}
```

## Performance

### ETL Mode
- First run: ~30-60 minutes (downloads + processing)
- Subsequent runs: ~1-2 minutes (metadata updates only)

### Empirical Setup
- Download time: 2-4 hours (depends on connection)
- Disk space: ~200GB

### Empirical Calculation
- Per trait: ~2 hours (2,504 samples × 3 sec/sample)
- All traits: ~8 days single-threaded
- With filtering: Proportional to trait count

## Troubleshooting

### "1000genomes data not found"
Run `pnpm pipeline empirical-setup` first.

### "bcftools not found"
The pipeline Docker image includes bcftools. If running locally:
```bash
# Ubuntu/Debian
sudo apt-get install bcftools

# macOS
brew install bcftools
```

### Out of memory
Reduce batch size or increase Docker memory limit:
```bash
# Edit docker-compose.yml
services:
  pipeline:
    mem_limit: 8g
```

## Advanced Usage

### Resume interrupted empirical calculation
The calculator stores intermediate results. Simply re-run:
```bash
pnpm pipeline empirical
```

### Recompute specific traits
```bash
pnpm pipeline empirical --traits EFO_0005106
```

### Custom 1000 Genomes location
Edit `scripts/pipeline-controller.js` to change mount path.
