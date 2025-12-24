import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import requests
import gzip
import os
import json
from io import StringIO
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

OUTPUT_DIR = "/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_trait_catalog():
    """Load the trait catalog configuration"""
    catalog_path = os.path.join(os.path.dirname(__file__), "trait_catalog.json")
    with open(catalog_path, 'r') as f:
        return json.load(f)

def get_trait_configs():
    """Extract subtypes and biomarkers as combined files"""
    catalog = load_trait_catalog()
    configs = {}
    
    for family_name, family_data in catalog["trait_families"].items():
        # Process subtypes - combine all PGS IDs into one file per subtype
        for subtype_name, subtype_data in family_data["subtypes"].items():
            key = f"{family_name}_{subtype_name}"
            configs[key] = {
                "pgs_ids": subtype_data["pgs_ids"],
                "name": subtype_data["name"],
                "description": subtype_data["description"],
                "category": family_data["category"],
                "source_family": family_name,
                "source_type": "subtype",
                "source_subtype": subtype_name,
                "weight": subtype_data.get("weight", 1.0)
            }
        
        # Process biomarkers - combine all PGS IDs into one file per biomarker
        if "biomarkers" in family_data:
            for biomarker_name, biomarker_data in family_data["biomarkers"].items():
                key = f"{family_name}_{biomarker_name}"
                configs[key] = {
                    "pgs_ids": biomarker_data["pgs_ids"],
                    "name": biomarker_data["name"],
                    "description": biomarker_data.get("description", ""),
                    "category": family_data["category"],
                    "source_family": family_name,
                    "source_type": "biomarker",
                    "source_subtype": biomarker_name,
                    "weight": 1.0
                }
    
    return configs

def needs_update(trait_name, config):
    """Check if trait pack needs updating"""
    output_path = os.path.join(OUTPUT_DIR, f"{trait_name}_hg38.parquet")
    
    if not os.path.exists(output_path):
        print(f"  - {trait_name}: No local file found, will download")
        return True
    
    return False  # Skip remote checks for predictable URLs

def download_and_combine_pgs(trait_name, config):
    """Download and combine multiple PGS files"""
    print(f"  - {trait_name}: Downloading {len(config['pgs_ids'])} PGS files...")
    
    combined_df = pd.DataFrame()
    
    for pgs_id in config['pgs_ids']:
        url = f"https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/{pgs_id}/ScoringFiles/{pgs_id}.txt.gz"
        print(f"    - Downloading {pgs_id}...")
        
        try:
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            
            content = gzip.decompress(response.content).decode('utf-8')
            lines = [line for line in content.split('\n') if not line.startswith('#') and line.strip()]
            
            if not lines:
                print(f"    - No data in {pgs_id}, skipping")
                continue
                
            df = pd.read_csv(StringIO('\n'.join(lines)), sep='\t')
            df['pgs_id'] = pgs_id  # Add PGS ID column
            
            combined_df = pd.concat([combined_df, df], ignore_index=True)
            print(f"    - Added {len(df)} variants from {pgs_id}")
            
        except Exception as e:
            print(f"    - Error downloading {pgs_id}: {e}")
            continue
    
    print(f"  - Combined total: {len(combined_df)} variants")
    return combined_df

def harmonize_pgs_data(df, config):
    """Convert PGS format to standardized schema with source tracking"""
    # Handle column variations
    if 'hm_chr' in df.columns:
        df['chr_name'] = df['hm_chr'].astype(str)
    elif 'CHR' in df.columns:
        df['chr_name'] = df['CHR'].astype(str)
        
    if 'hm_pos' in df.columns:
        df['chr_position'] = df['hm_pos']
    elif 'POS' in df.columns:
        df['chr_position'] = df['POS']
        
    if 'effect_allele' not in df.columns and 'EA' in df.columns:
        df['effect_allele'] = df['EA']
        
    if 'other_allele' not in df.columns and 'OA' in df.columns:
        df['other_allele'] = df['OA']
        
    if 'effect_weight' not in df.columns and 'BETA' in df.columns:
        df['effect_weight'] = df['BETA']
    elif 'effect_weight' not in df.columns and 'OR' in df.columns:
        df['effect_weight'] = df['OR']
    
    # Add source tracking columns
    df['source_family'] = config['source_family']
    df['source_type'] = config['source_type']
    df['source_subtype'] = config['source_subtype']
    df['source_weight'] = config['weight']
    
    # Select required columns (pgs_id already added in download step)
    required_cols = ['chr_name', 'chr_position', 'effect_allele', 'other_allele', 'effect_weight', 
                    'pgs_id', 'source_family', 'source_type', 'source_subtype', 'source_weight']
    df = df[required_cols].dropna()
    
    # Clean chromosome names
    df['chr_name'] = df['chr_name'].astype(str).str.replace('chr', '', regex=False)
    df['weight_type'] = 'log_odds'
    
    return df

def update_trait_catalog(updated_data):
    """Update trait catalog with timestamps and variant counts"""
    catalog_path = os.path.join(os.path.dirname(__file__), "trait_catalog.json")
    
    with open(catalog_path, 'r') as f:
        catalog = json.load(f)
    
    # Update timestamps and variant counts
    for family_name, family_data in catalog["trait_families"].items():
        for subtype_name, subtype_data in family_data["subtypes"].items():
            key = f"{family_name}_{subtype_name}"
            if key in updated_data:
                catalog["trait_families"][family_name]["subtypes"][subtype_name]["last_updated"] = updated_data[key]["timestamp"]
                catalog["trait_families"][family_name]["subtypes"][subtype_name]["variant_count"] = updated_data[key]["variant_count"]
        
        if "biomarkers" in family_data:
            for biomarker_name, biomarker_data in family_data["biomarkers"].items():
                key = f"{family_name}_{biomarker_name}"
                if key in updated_data:
                    catalog["trait_families"][family_name]["biomarkers"][biomarker_name]["last_updated"] = updated_data[key]["timestamp"]
                    catalog["trait_families"][family_name]["biomarkers"][biomarker_name]["variant_count"] = updated_data[key]["variant_count"]
    
    with open(catalog_path, 'w') as f:
        json.dump(catalog, f, indent=2)
    
    # Copy to output directory
    output_catalog_path = os.path.join(OUTPUT_DIR, "trait_catalog.json")
    with open(output_catalog_path, 'w') as f:
        json.dump(catalog, f, indent=2)

def generate_trait_pack(trait_name, config):
    print(f"Checking {trait_name}...")
    
    output_path = os.path.join(OUTPUT_DIR, f"{trait_name}_hg38.parquet")
    
    if not needs_update(trait_name, config):
        print(f"  - Skipping {trait_name} (up to date)")
        return None
        
    print(f"  - Generating {trait_name}...")
    
    df = download_and_combine_pgs(trait_name, config)
    if df.empty:
        print(f"  - No data for {trait_name}, skipping")
        return None
        
    df = harmonize_pgs_data(df, config)
    
    # Sort by chromosome and position
    chr_order = [str(i) for i in range(1, 23)] + ['X', 'Y', 'MT']
    df['chr_name'] = pd.Categorical(df['chr_name'], categories=chr_order, ordered=True)
    df = df.sort_values(['chr_name', 'chr_position'])
    
    # Write Parquet
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(table, output_path, compression='ZSTD', compression_level=3)
    
    print(f"Successfully generated: {output_path} ({len(df)} variants)")
    return {"timestamp": datetime.now().isoformat(), "variant_count": len(df)}

if __name__ == "__main__":
    trait_configs = get_trait_configs()
    updated_data = {}
    
    for trait_name, config in trait_configs.items():
        try:
            result = generate_trait_pack(trait_name, config)
            if result:
                updated_data[trait_name] = result
        except Exception as e:
            print(f"Error processing {trait_name}: {e}")
    
    update_trait_catalog(updated_data)
    print("ETL Job Complete. Trait packs ready for serving.")