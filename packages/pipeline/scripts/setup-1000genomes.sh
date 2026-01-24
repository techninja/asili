#!/bin/bash
# Download and prepare 1000 Genomes Project data for empirical PGS calculations

set -e

GENOMES_DIR="${1:-./1000genomes}"
mkdir -p "$GENOMES_DIR/vcf"

echo "=== 1000 Genomes Project Data Setup ==="
echo "Target directory: $GENOMES_DIR"
echo ""

# Download sample panel
echo "Downloading sample panel..."
wget -q -O "$GENOMES_DIR/integrated_call_samples_v3.20130502.ALL.panel" \
  ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/integrated_call_samples_v3.20130502.ALL.panel

SAMPLE_COUNT=$(tail -n +2 "$GENOMES_DIR/integrated_call_samples_v3.20130502.ALL.panel" | wc -l)
echo "Found $SAMPLE_COUNT samples"
echo ""

# Download VCF files by chromosome
echo "Downloading VCF files (this will take a while - ~200GB)..."
echo "You can interrupt and resume this script - wget will continue partial downloads"
echo ""

# Autosomes (1-22)
for CHR in {1..22}; do
  # Skip if already downloaded
  if [ -f "$GENOMES_DIR/vcf/chr${CHR}.vcf.gz" ]; then
    echo "Chromosome $CHR already downloaded, skipping..."
    continue
  fi
  
  echo "Chromosome $CHR..."
  VCF_URL="ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chr${CHR}.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz"
  
  if wget -c -q --show-progress -O "$GENOMES_DIR/vcf/chr${CHR}.vcf.gz" "$VCF_URL" 2>&1; then
    wget -c -q -O "$GENOMES_DIR/vcf/chr${CHR}.vcf.gz.tbi" "${VCF_URL}.tbi" 2>&1 || echo "  Warning: Could not download index for chr${CHR}"
  else
    echo "  Warning: Could not download chr${CHR}, skipping..."
    rm -f "$GENOMES_DIR/vcf/chr${CHR}.vcf.gz"
  fi
done

# Chromosome X (different naming pattern)
if [ ! -f "$GENOMES_DIR/vcf/chrX.vcf.gz" ]; then
  echo "Chromosome X..."
  VCF_URL="ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chrX.phase3_shapeit2_mvncall_integrated_v1c.20130502.genotypes.vcf.gz"
  if wget -c -q --show-progress -O "$GENOMES_DIR/vcf/chrX.vcf.gz" "$VCF_URL" 2>&1; then
    wget -c -q -O "$GENOMES_DIR/vcf/chrX.vcf.gz.tbi" "${VCF_URL}.tbi" 2>&1 || echo "  Warning: Could not download index for chrX"
  else
    echo "  Warning: Could not download chrX, skipping..."
    rm -f "$GENOMES_DIR/vcf/chrX.vcf.gz"
  fi
else
  echo "Chromosome X already downloaded, skipping..."
fi

# Chromosome Y (different naming pattern)
if [ ! -f "$GENOMES_DIR/vcf/chrY.vcf.gz" ]; then
  echo "Chromosome Y..."
  VCF_URL="ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chrY.phase3_integrated_v2b.20130502.genotypes.vcf.gz"
  if wget -c -q --show-progress -O "$GENOMES_DIR/vcf/chrY.vcf.gz" "$VCF_URL" 2>&1; then
    wget -c -q -O "$GENOMES_DIR/vcf/chrY.vcf.gz.tbi" "${VCF_URL}.tbi" 2>&1 || echo "  Warning: Could not download index for chrY"
  else
    echo "  Warning: Could not download chrY, skipping..."
    rm -f "$GENOMES_DIR/vcf/chrY.vcf.gz"
  fi
else
  echo "Chromosome Y already downloaded, skipping..."
fi

echo ""
echo "=== Download Complete ==="
echo "Data location: $GENOMES_DIR"
echo "Total size: $(du -sh $GENOMES_DIR | cut -f1)"
echo "Downloaded chromosomes: $(ls $GENOMES_DIR/vcf/*.vcf.gz 2>/dev/null | wc -l)"
echo ""

# Convert to PLINK2 binary format
if [ ! -f "$GENOMES_DIR/chr1.bed" ]; then
  echo "=== Converting VCF to PLINK2 binary format ==="
  echo "This is a one-time preprocessing step..."
  node "$(dirname "$0")/../lib/vcf-to-plink.js" "$GENOMES_DIR/vcf" "$GENOMES_DIR"
else
  echo "PLINK binary files already exist: $GENOMES_DIR/chr*.bed"
fi

echo ""
echo "Next steps:"
echo "  1. Run empirical calculator: pnpm pipeline empirical"
echo "  2. This will compute PGS distributions for all traits (~hours to days)"
echo "  3. Results will be merged into trait_manifest.json"
