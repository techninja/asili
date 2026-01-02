#!/usr/bin/env python3
"""
Batched GPU processing for large datasets
Process hypertension in chunks to avoid memory limits
"""

import requests
import gzip
import json
import os
import time
import pandas as pd
from pathlib import Path
from gpu_pipeline import GPUGenomicBuffer

# Hypertension PGS IDs
HYPERTENSION_PGS_IDS = [
    "PGS000706", "PGS001320", "PGS001838", "PGS002047", "PGS002296",
    "PGS002335", "PGS002407", "PGS002456", "PGS002505", "PGS002554",
    "PGS002603", "PGS002652", "PGS002701", "PGS002765", "PGS002777",
    "PGS002778", "PGS002994", "PGS002995", "PGS002996", "PGS002997",
    "PGS002998", "PGS002999", "PGS003000", "PGS003001", "PGS003002",
    "PGS003003", "PGS003004", "PGS003005", "PGS003006", "PGS003007",
    "PGS003008", "PGS003009", "PGS003010", "PGS003011", "PGS003012",
    "PGS003013", "PGS003014", "PGS003015", "PGS003016", "PGS003017",
    "PGS003018", "PGS003019", "PGS003020", "PGS003021", "PGS003022",
    "PGS003023", "PGS003024", "PGS003025", "PGS003026", "PGS003027",
    "PGS003028", "PGS004191", "PGS004192", "PGS004193", "PGS004194",
    "PGS004195", "PGS004234", "PGS004236", "PGS004455", "PGS004525",
    "PGS004785", "PGS004786", "PGS004787", "PGS004788", "PGS004934",
    "PGS005144", "PGS005153"
]

def download_pgs_file(pgs_id, cache_dir="pgs_cache"):
    cache_path = Path(cache_dir)
    cache_path.mkdir(exist_ok=True)
    file_path = cache_path / f"{pgs_id}.txt.gz"
    
    if file_path.exists():
        return str(file_path)
    
    try:
        api_url = f"https://www.pgscatalog.org/rest/score/{pgs_id}"
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if not data.get('ftp_scoring_file'):
            return None
        
        file_url = data['ftp_scoring_file']
        print(f"   📥 {pgs_id} downloading...")
        
        file_response = requests.get(file_url, timeout=120)
        file_response.raise_for_status()
        
        with open(file_path, 'wb') as f:
            f.write(file_response.content)
        
        print(f"   ✓ {pgs_id} downloaded")
        return str(file_path)
        
    except Exception as e:
        print(f"   ❌ {pgs_id} failed: {e}")
        return None

def main():
    print("🧬 Batched Hypertension GPU Processing")
    print("=" * 50)
    
    # Process in batches of 15 files
    batch_size = 15
    batches = [HYPERTENSION_PGS_IDS[i:i+batch_size] for i in range(0, len(HYPERTENSION_PGS_IDS), batch_size)]
    
    print(f"📊 Processing {len(HYPERTENSION_PGS_IDS)} files in {len(batches)} batches")
    
    all_results = []
    total_variants = 0
    
    for batch_num, batch_ids in enumerate(batches, 1):
        print(f"\n🚀 Batch {batch_num}/{len(batches)}: {len(batch_ids)} files")
        
        # Download batch files
        pgs_files = []
        for pgs_id in batch_ids:
            file_path = download_pgs_file(pgs_id)
            if file_path:
                pgs_files.append({'pgs_id': pgs_id, 'path': file_path})
            time.sleep(0.1)
        
        if not pgs_files:
            print(f"   ❌ No files in batch {batch_num}")
            continue
        
        # Process batch with GPU
        try:
            buffer = GPUGenomicBuffer()
            batch_output = f'hypertension_batch_{batch_num}.parquet'
            
            start_time = time.time()
            variant_count = buffer.process_pgs_files_batch(pgs_files, batch_output)
            batch_time = time.time() - start_time
            
            print(f"   ✅ Batch {batch_num}: {variant_count:,} variants in {batch_time:.1f}s")
            
            # Load and store results
            if os.path.exists(batch_output):
                df = pd.read_parquet(batch_output)
                all_results.append(df)
                total_variants += len(df)
                os.unlink(batch_output)  # Clean up
            
        except Exception as e:
            print(f"   ❌ Batch {batch_num} failed: {e}")
            continue
    
    # Combine all batches
    if all_results:
        print(f"\n🔄 Combining {len(all_results)} batches...")
        
        final_df = pd.concat(all_results, ignore_index=True)
        final_df = final_df.drop_duplicates('variant_id')
        
        final_df.to_parquet('hypertension_full.parquet', compression='snappy')
        
        print(f"\n🎯 Final Results:")
        print(f"   Total variants: {len(final_df):,}")
        print(f"   Output: hypertension_full.parquet")
        print(f"   Size: {os.path.getsize('hypertension_full.parquet')/1024**2:.1f}MB")
        print(f"   ✅ Successfully processed full hypertension dataset!")
    
    else:
        print("❌ No successful batches")

if __name__ == "__main__":
    main()