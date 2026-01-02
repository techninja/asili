#!/usr/bin/env python3
"""
Smart batching based on variant counts
Batch by total variants (~500K per batch) instead of file count
"""

import requests
import gzip
import json
import os
import time
import pandas as pd
import subprocess
import sys
from pathlib import Path

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

def get_variant_count(file_path):
    """Count variants in PGS file"""
    try:
        with gzip.open(file_path, 'rt') as f:
            lines = f.readlines()
        
        # Count non-comment data lines
        count = 0
        for line in lines:
            if not line.startswith('#') and line.strip():
                count += 1
        
        return max(0, count - 1)  # Subtract header
    except:
        return 0

def download_and_size_pgs_files():
    """Download files and get their variant counts"""
    pgs_info = []
    
    for pgs_id in HYPERTENSION_PGS_IDS:
        cache_path = Path("pgs_cache") / f"{pgs_id}.txt.gz"
        
        # Download if needed
        if not cache_path.exists():
            try:
                api_url = f"https://www.pgscatalog.org/rest/score/{pgs_id}"
                response = requests.get(api_url, timeout=30)
                data = response.json()
                
                if data.get('ftp_scoring_file'):
                    print(f"📥 Downloading {pgs_id}...")
                    file_response = requests.get(data['ftp_scoring_file'], timeout=120)
                    cache_path.parent.mkdir(exist_ok=True)
                    cache_path.write_bytes(file_response.content)
                    time.sleep(0.1)
            except Exception as e:
                print(f"❌ {pgs_id}: {e}")
                continue
        
        # Get variant count
        if cache_path.exists():
            variant_count = get_variant_count(cache_path)
            pgs_info.append({
                'pgs_id': pgs_id,
                'path': str(cache_path),
                'variants': variant_count
            })
            print(f"✓ {pgs_id}: {variant_count:,} variants")
    
    return pgs_info

def process_large_file_in_chunks(pgs_info, max_chunk_size=1000000):
    """Split large files into chunks"""
    if pgs_info['variants'] <= max_chunk_size:
        return [pgs_info]
    
    print(f"   📦 Chunking {pgs_info['pgs_id']} ({pgs_info['variants']:,} variants)")
    
    chunks = []
    with gzip.open(pgs_info['path'], 'rt') as f:
        lines = f.readlines()
    
    # Find header
    header_idx = None
    for i, line in enumerate(lines):
        if not line.startswith('#') and line.strip():
            header_idx = i
            break
    
    if header_idx is None:
        return [pgs_info]
    
    header = lines[header_idx]
    data_lines = [line for line in lines[header_idx+1:] if line.strip() and not line.startswith('#')]
    
    # Create chunks
    for i in range(0, len(data_lines), max_chunk_size):
        chunk_lines = data_lines[i:i+max_chunk_size]
        chunk_path = f"{pgs_info['path']}.chunk_{i//max_chunk_size}"
        
        with open(chunk_path, 'w') as f:
            f.write(header)
            f.writelines(chunk_lines)
        
        chunks.append({
            'pgs_id': f"{pgs_info['pgs_id']}_chunk_{i//max_chunk_size}",
            'path': chunk_path,
            'variants': len(chunk_lines)
        })
    
    print(f"   📦 Split into {len(chunks)} chunks")
    return chunks

def create_smart_batches(pgs_info, max_variants_per_batch=500000):
    """Create batches based on variant count, with file chunking for large files"""
    # First, chunk any large files
    processed_files = []
    for pgs in pgs_info:
        if pgs['variants'] > 2000000:  # Chunk files > 2M variants
            chunks = process_large_file_in_chunks(pgs, max_chunk_size=1000000)
            processed_files.extend(chunks)
        else:
            processed_files.append(pgs)
    
    print(f"📦 After chunking: {len(processed_files)} files/chunks")
    
    # Sort by variant count (largest first for better packing)
    processed_files.sort(key=lambda x: x['variants'], reverse=True)
    
    batches = []
    current_batch = []
    current_count = 0
    
    for pgs in processed_files:
        # If adding this file would exceed limit, start new batch
        if current_count + pgs['variants'] > max_variants_per_batch and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_count = 0
        
        current_batch.append(pgs)
        current_count += pgs['variants']
    
    # Add final batch
    if current_batch:
        batches.append(current_batch)
    
    return batches

def main():
    print("🧬 Smart Batched Hypertension GPU Processing")
    print("=" * 60)
    
    # Check for existing progress
    progress_file = 'batch_progress.json'
    completed_batches = set()
    all_results = []
    
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            progress = json.load(f)
            completed_batches = set(progress.get('completed_batches', []))
            print(f"📂 Found {len(completed_batches)} completed batches")
            
            # Load existing results
            for batch_num in completed_batches:
                result_file = f'batch_{batch_num}_result.parquet'
                if os.path.exists(result_file):
                    df = pd.read_parquet(result_file)
                    all_results.append(df)
                    print(f"   ✓ Loaded batch {batch_num}: {len(df):,} variants")
    
    # Download and analyze all files
    print("📊 Analyzing PGS files...")
    pgs_info = download_and_size_pgs_files()
    
    total_variants = sum(p['variants'] for p in pgs_info)
    print(f"\n📈 Total: {len(pgs_info)} files, {total_variants:,} variants")
    
    # Create smart batches
    batches = create_smart_batches(pgs_info, max_variants_per_batch=500000)
    
    print(f"\n🎯 Created {len(batches)} smart batches:")
    for i, batch in enumerate(batches, 1):
        batch_variants = sum(p['variants'] for p in batch)
        status = "✅ DONE" if i in completed_batches else "⏳ TODO"
        print(f"   Batch {i}: {len(batch)} files, {batch_variants:,} variants {status}")
    
    # Process remaining batches
    for batch_num, batch in enumerate(batches, 1):
        if batch_num in completed_batches:
            continue
            
        batch_variants = sum(p['variants'] for p in batch)
        print(f"\n🚀 Processing Batch {batch_num}: {batch_variants:,} variants")
        
        try:
            # Write batch to temp file
            batch_file = f'temp_batch_{batch_num}.json'
            with open(batch_file, 'w') as f:
                json.dump(batch, f)
            
            # Run batch in subprocess to prevent memory leaks
            cmd = [sys.executable, 'batch_runner.py', batch_file, str(batch_num), batch_output]
            
            start_time = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
            batch_time = time.time() - start_time
            
            # Cleanup temp file
            if os.path.exists(batch_file):
                os.unlink(batch_file)
            
            if result.returncode == 0:
                print(f"   ✅ Batch completed in {batch_time:.1f}s")
                print(result.stdout.strip())
                
                # Load results
                if os.path.exists(batch_output):
                    df = pd.read_parquet(batch_output)
                    result_file = f'batch_{batch_num}_result.parquet'
                    df.to_parquet(result_file, compression='snappy')
                    all_results.append(df)
                    os.unlink(batch_output)
                    
                    # Update progress
                    completed_batches.add(batch_num)
                    with open(progress_file, 'w') as f:
                        json.dump({'completed_batches': list(completed_batches)}, f)
            else:
                print(f"   ❌ Subprocess failed: {result.stderr}")
                raise Exception(f"Batch {batch_num} subprocess failed")
            
        except Exception as e:
            print(f"   ❌ Batch {batch_num} failed: {e}")
            raise e  # Terminate on batch failure
    
    # Final merge
    if all_results:
        print(f"\n🔄 Merging {len(all_results)} batches...")
        final_df = pd.concat(all_results, ignore_index=True)
        final_df = final_df.drop_duplicates('variant_id')
        
        final_df.to_parquet('hypertension_smart.parquet', compression='snappy')
        
        print(f"\n🎯 Final Results:")
        print(f"   Unique variants: {len(final_df):,}")
        print(f"   File size: {os.path.getsize('hypertension_smart.parquet')/1024**2:.1f}MB")
        print("   ✅ Smart batching successful!")
        
        # Cleanup individual batch files
        for batch_num in completed_batches:
            result_file = f'batch_{batch_num}_result.parquet'
            if os.path.exists(result_file):
                os.unlink(result_file)
        os.unlink(progress_file)

if __name__ == "__main__":
    main()