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

# Output directory mapped in docker-compose
OUTPUT_DIR = "/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def load_trait_catalog():
    """Load trait catalog from canonical source"""
    catalog_path = os.path.join(os.path.dirname(__file__), "trait_catalog.json")
    with open(catalog_path, 'r') as f:
        return json.load(f)

def get_trait_configs():
    """Convert catalog to config format for processing"""
    catalog = load_trait_catalog()
    configs = {}
    
    for trait in catalog["traits"]:
        # Convert filename to config key
        key = trait["file"].replace("_hg38.parquet", "")
        configs[key] = {
            "pgs_id": trait["pgs_id"],
            "name": trait["name"],
            "description": trait["description"],
            "category": trait["category"],
            "url": trait["url"]
        }
    
    return configs

def needs_update(trait_name, config):
    """Check if trait pack needs updating based on remote file modification time"""
    output_path = os.path.join(OUTPUT_DIR, f"{trait_name}_hg38.parquet")
    
    if not os.path.exists(output_path):
        print(f"  - {trait_name}: No local file found, will download")
        return True
    
    # Get local file modification time (make timezone-aware)
    local_mtime = datetime.fromtimestamp(os.path.getmtime(output_path), tz=timezone.utc)
    print(f"  - {trait_name}: Local file modified {local_mtime}")
    
    # Get remote file modification time via HEAD request
    try:
        print(f"  - {trait_name}: Checking remote file at {config['url']}")
        response = requests.head(config["url"], timeout=30)
        print(f"  - {trait_name}: Remote response status {response.status_code}")
        
        if 'Last-Modified' in response.headers:
            remote_mtime = parsedate_to_datetime(response.headers['Last-Modified'])
            print(f"  - {trait_name}: Remote file modified {remote_mtime}")
            needs_update = remote_mtime > local_mtime
            print(f"  - {trait_name}: Needs update: {needs_update}")
            return needs_update
        else:
            print(f"  - {trait_name}: No Last-Modified header, assuming update needed")
    except Exception as e:
        print(f"  - {trait_name}: Could not check remote modification time: {e}")
    
    return False

def download_and_parse_pgs(trait_name, config):
    print(f"  - {trait_name}: Starting download from {config['url']}")
    
    response = requests.get(config["url"], timeout=60)
    print(f"  - {trait_name}: Download complete, status {response.status_code}, size {len(response.content)} bytes")
    response.raise_for_status()
    
    # Decompress gzipped content
    print(f"  - {trait_name}: Decompressing gzipped content...")
    content = gzip.decompress(response.content).decode('utf-8')
    print(f"  - {trait_name}: Decompressed to {len(content)} characters")
    
    # Skip header lines starting with #
    lines = [line for line in content.split('\n') if not line.startswith('#') and line.strip()]
    print(f"  - {trait_name}: Found {len(lines)} data lines after filtering headers")
    
    # Parse as CSV
    df = pd.read_csv(StringIO('\n'.join(lines)), sep='\t')
    print(f"  - {trait_name}: Parsed into DataFrame with columns: {list(df.columns)}")
    
    return df

def harmonize_pgs_data(df):
    """Convert PGS format to standardized schema"""
    # Map PGS columns to our schema
    column_mapping = {
        'chr_name': 'chr_name',
        'chr_position': 'chr_position', 
        'effect_allele': 'effect_allele',
        'other_allele': 'other_allele',
        'effect_weight': 'effect_weight'
    }
    
    # Handle common PGS column variations
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
    
    # Select and clean required columns
    required_cols = ['chr_name', 'chr_position', 'effect_allele', 'other_allele', 'effect_weight']
    df = df[required_cols].dropna()
    
    # Clean chromosome names (remove 'chr' prefix)
    df['chr_name'] = df['chr_name'].astype(str).str.replace('chr', '', regex=False)
    
    # Add weight type
    df['weight_type'] = 'log_odds'
    
    return df

def update_trait_catalog(trait_name, config, variant_count):
    """Update the trait catalog with metadata"""
    catalog_path = os.path.join(OUTPUT_DIR, "trait_catalog.json")
    
    # Load existing catalog or create new
    if os.path.exists(catalog_path):
        with open(catalog_path, 'r') as f:
            catalog = json.load(f)
    else:
        catalog = {"traits": []}
    
    # Find or create trait entry
    trait_id = trait_name.lower()
    trait_entry = None
    for trait in catalog["traits"]:
        if trait["id"] == trait_id:
            trait_entry = trait
            break
    
    if not trait_entry:
        trait_entry = {
            "id": trait_id,
            "file": f"{trait_name}_hg38.parquet"
        }
        catalog["traits"].append(trait_entry)
    
    # Update metadata
    trait_entry.update({
        "name": config["name"],
        "description": config["description"],
        "category": config["category"],
        "pgs_id": config["pgs_id"],
        "variant_count": variant_count,
        "last_updated": datetime.now().isoformat()
    })
    
    # Save catalog
    with open(catalog_path, 'w') as f:
        json.dump(catalog, f, indent=2)
    
    print(f"Updated trait catalog with {trait_name}")

def generate_trait_pack(trait_name, config):
    print(f"Checking {trait_name}...")
    
    if not needs_update(trait_name, config):
        print(f"  - Skipping {trait_name} (up to date)")
        return
        
    print(f"  - Generating {trait_name}...")
    
    # Download and parse PGS data
    df = download_and_parse_pgs(trait_name, config)
    print(f"Downloaded {len(df)} variants")
    
    # Harmonize to standard schema
    df = harmonize_pgs_data(df)
    print(f"Harmonized to {len(df)} valid variants")
    
    # Natural sort chromosomes (1, 2, ..., 10, 11, ..., 22, X, Y)
    chr_order = [str(i) for i in range(1, 23)] + ['X', 'Y', 'MT']
    df['chr_name'] = pd.Categorical(df['chr_name'], categories=chr_order, ordered=True)
    df = df.sort_values(['chr_name', 'chr_position'])
    
    # Create PyArrow table
    table = pa.Table.from_pandas(df, preserve_index=False)
    
    # Write optimized Parquet
    output_path = os.path.join(OUTPUT_DIR, f"{trait_name}_hg38.parquet")
    pq.write_table(
        table,
        output_path,
        compression='ZSTD',
        compression_level=3,
        use_dictionary=True,
        write_statistics=True
    )
    
    print(f"Successfully generated: {output_path}")
    print(f"  - Rows: {len(df)}")
    print(f"  - Size: {os.path.getsize(output_path) / 1024 / 1024:.2f} MB")
    
    # Update trait catalog
    update_trait_catalog(trait_name, config, len(df))

if __name__ == "__main__":
    trait_configs = get_trait_configs()
    
    for trait_name, config in trait_configs.items():
        try:
            generate_trait_pack(trait_name, config)
        except Exception as e:
            print(f"Error processing {trait_name}: {e}")
    
    print("ETL Job Complete. Real trait packs ready for serving.")
