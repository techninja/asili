#!/usr/bin/env python3
"""
Test GPU processing with real hypertension PGS data
MONDO:0000537 - 66 PGS files, ~39M unique variants
"""

import requests
import gzip
import json
import os
import time
from pathlib import Path
from gpu_pipeline import GPUGenomicBuffer

# Hypertension PGS IDs from trait catalog
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
    """Download PGS file from catalog"""
    cache_path = Path(cache_dir)
    cache_path.mkdir(exist_ok=True)
    
    file_path = cache_path / f"{pgs_id}.txt.gz"
    
    if file_path.exists():
        print(f"   ✓ {pgs_id} (cached)")
        return str(file_path)
    
    try:
        # Get scoring file URL from PGS API
        api_url = f"https://www.pgscatalog.org/rest/score/{pgs_id}"
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if not data.get('ftp_scoring_file'):
            print(f"   ❌ {pgs_id} (no scoring file)")
            return None
        
        # Download scoring file
        file_url = data['ftp_scoring_file']
        print(f"   📥 {pgs_id} downloading...")
        
        file_response = requests.get(file_url, timeout=120)
        file_response.raise_for_status()
        
        with open(file_path, 'wb') as f:
            f.write(file_response.content)
        
        print(f"   ✓ {pgs_id} downloaded ({len(file_response.content)//1024}KB)")
        return str(file_path)
        
    except Exception as e:
        print(f"   ❌ {pgs_id} failed: {e}")
        return None

def main():
    print("🧬 Hypertension GPU Processing Test")
    print("=" * 50)
    print(f"📊 Processing {len(HYPERTENSION_PGS_IDS)} PGS files")
    print("📈 Expected: ~39M unique variants")
    print("")
    
    # Download all files for full test
    test_pgs_ids = HYPERTENSION_PGS_IDS
    print(f"🧪 Processing all {len(test_pgs_ids)} files...")
    
    # Download files
    print("📥 Downloading PGS files...")
    pgs_files = []
    
    for pgs_id in test_pgs_ids:
        file_path = download_pgs_file(pgs_id)
        if file_path:
            pgs_files.append({
                'pgs_id': pgs_id,
                'path': file_path
            })
        
        time.sleep(0.2)  # Rate limiting
    
    if not pgs_files:
        print("❌ No files downloaded successfully")
        return
    
    print(f"✅ Downloaded {len(pgs_files)} files")
    
    # Test GPU processing
    print("\n🚀 Testing GPU buffer processing...")
    
    try:
        buffer = GPUGenomicBuffer()
        
        start_time = time.time()
        variant_count = buffer.process_pgs_files_batch(pgs_files, 'hypertension_test.parquet')
        gpu_time = time.time() - start_time
        
        print(f"\n🎯 GPU Results:")
        print(f"   Variants: {variant_count:,}")
        print(f"   Time: {gpu_time:.2f}s")
        print(f"   Rate: {variant_count/gpu_time:,.0f} variants/sec")
        print(f"   Memory: ~21GB GPU buffer")
        
        # Check output file
        if os.path.exists('hypertension_test.parquet'):
            size_mb = os.path.getsize('hypertension_test.parquet') / 1024**2
            print(f"   Output: {size_mb:.1f}MB parquet file")
            
            # Verify with pandas
            import pandas as pd
            df = pd.read_parquet('hypertension_test.parquet')
            print(f"   Verified: {len(df)} variants in parquet")
            
            os.unlink('hypertension_test.parquet')
        
        print("\n✅ GPU processing successful!")
        print("💡 This approach could handle the full 66-file hypertension dataset")
        
    except Exception as e:
        print(f"\n❌ GPU processing failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()