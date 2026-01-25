#!/bin/bash
# Test PLINK2 scoring workflow

set -e

echo "=== PLINK2 Scoring Test ==="
echo ""

# Check PLINK2 is available
echo "1. Checking PLINK2 installation..."
plink2 --version || { echo "ERROR: plink2 not found"; exit 1; }
echo ""

# Check data files exist
echo "2. Checking data files..."
if [ ! -f "../../data_out/1000genomes/chr22.bed" ]; then
  echo "ERROR: PLINK binary files not found"
  exit 1
fi
echo "✓ PLINK binary files exist"

if [ ! -f "../../data_out/1000genomes/integrated_call_samples_v3.20130502.ALL.panel" ]; then
  echo "ERROR: Sample panel not found"
  exit 1
fi
echo "✓ Sample panel exists"

# Find a trait file
TRAIT_FILE=$(ls ../../data_out/packs/*.parquet 2>/dev/null | head -1)
if [ -z "$TRAIT_FILE" ]; then
  echo "ERROR: No trait parquet files found"
  exit 1
fi
echo "✓ Found trait file: $TRAIT_FILE"
echo ""

# Check variant IDs match
echo "3. Checking variant ID formats..."
echo "PLINK .bim format (first 3 variants from chr22):"
head -3 ../../data_out/1000genomes/chr22.bim | awk '{print "  " $2}'

echo ""
echo "Trait file format (first 3 variants):"
duckdb -c "SELECT variant_id FROM read_parquet('$TRAIT_FILE') LIMIT 3" | tail -n +4 | head -3 | sed 's/^/  /'
echo ""

# Create test score file with chr22 variants
echo "4. Creating test score file..."
SCORE_FILE="/tmp/test_score_$$.txt"
duckdb -c "SELECT variant_id, effect_allele, effect_weight FROM read_parquet('$TRAIT_FILE') WHERE variant_id LIKE '22:%' LIMIT 100" -csv | tail -n +2 | tr ',' ' ' > $SCORE_FILE

VARIANT_COUNT=$(wc -l < $SCORE_FILE)
echo "✓ Created score file with $VARIANT_COUNT chr22 variants"
echo ""

# Run PLINK2 scoring on chr22
echo "5. Running PLINK2 --score on chr22..."
OUT_PREFIX="/tmp/test_pgs_$$"
plink2 --bfile ../../data_out/1000genomes/chr22 \
  --score $SCORE_FILE 1 2 3 \
  --out $OUT_PREFIX \
  --threads max

echo ""
echo "6. Checking results..."
if [ ! -f "${OUT_PREFIX}.sscore" ]; then
  echo "ERROR: No .sscore file generated"
  exit 1
fi

SAMPLE_COUNT=$(tail -n +2 ${OUT_PREFIX}.sscore | wc -l)
echo "✓ Generated scores for $SAMPLE_COUNT samples"

echo ""
echo "Sample scores (first 5):"
head -6 ${OUT_PREFIX}.sscore | tail -5 | awk '{printf "  Sample %s: score = %.6f\n", $1, $5}'

# Check score statistics
echo ""
echo "7. Score statistics:"
tail -n +2 ${OUT_PREFIX}.sscore | awk '{print $5}' | awk '
  BEGIN {sum=0; sum2=0; n=0; min=999999; max=-999999}
  {
    sum+=$1; sum2+=$1*$1; n++;
    if($1<min) min=$1;
    if($1>max) max=$1;
  }
  END {
    mean=sum/n;
    sd=sqrt(sum2/n - mean*mean);
    printf "  Samples: %d\n", n;
    printf "  Mean: %.6f\n", mean;
    printf "  SD: %.6f\n", sd;
    printf "  Min: %.6f\n", min;
    printf "  Max: %.6f\n", max;
  }
'

# Cleanup
rm -f $SCORE_FILE ${OUT_PREFIX}.*

echo ""
echo "=== Test Complete ==="
echo "✓ PLINK2 scoring workflow is working correctly"
