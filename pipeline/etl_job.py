import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import numpy as np
import os

# Output directory mapped in docker-compose
OUTPUT_DIR = "/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_mock_trait_pack(trait_name, num_variants=100000):
    """
    Generates a scientifically structured Trait Pack conforming to the 
    schema defined in the architectural report.
    """
    print(f"Generating Trait Pack for: {trait_name}...")

    # 1. Generate Mock Data simulating GWAS results
    # In a real scenario, this would read from a PGS Catalog .txt.gz file
    chromosomes = np.random.choice([str(i) for i in range(1, 23)], num_variants)
    positions = np.random.randint(1, 240000000, num_variants)
    effect_alleles = np.random.choice(['A', 'C', 'G', 'T'], num_variants)
    other_alleles = np.random.choice(['A', 'C', 'G', 'T'], num_variants)
    
    # Weights (Log Odds Ratios)
    weights = np.random.normal(loc=0.05, scale=0.2, size=num_variants)

    df = pd.DataFrame({
        'chr_name': chromosomes,
        'chr_position': positions,
        'effect_allele': effect_alleles,
        'other_allele': other_alleles,
        'effect_weight': weights,
        'weight_type': 'log_odds'
    })

    # 2. CRITICAL OPTIMIZATION: Sort by Location
    # As per Report Section 4.3, sorting is required for Merge Joins
    # We treat chromosomes as categorical to ensure 1, 2, ... 10 order, not 1, 10, 2
    df['chr_name'] = df['chr_name'].astype(str)
    # Simple sort for mock data; production needs natural sort (1, 2, 10)
    df = df.sort_values(by=['chr_name', 'chr_position'])

    # 3. Create PyArrow Table
    table = pa.Table.from_pandas(df, preserve_index=False)

    # 4. Write to Parquet with ZSTD Compression
    # As per Report Section 4.2: ZSTD balances size and decode speed
    output_path = os.path.join(OUTPUT_DIR, f"{trait_name}_hg38.parquet")
    
    pq.write_table(
        table, 
        output_path, 
        compression='ZSTD',
        compression_level=3,
        use_dictionary=True, # Optimizes repeated strings like 'chr1'
        write_statistics=True # Essential for DuckDB filter pushdown
    )
    
    print(f"Successfully generated: {output_path}")
    print(f"  - Rows: {len(df)}")
    print(f"  - Size: {os.path.getsize(output_path) / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    # Generate packs for a few demo traits
    generate_mock_trait_pack("Alzheimers_Risk")
    generate_mock_trait_pack("Type_2_Diabetes")
    generate_mock_trait_pack("Coronary_Artery_Disease")
    print("ETL Job Complete. Parquet files ready for serving.")
