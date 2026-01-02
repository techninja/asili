#!/usr/bin/env python3
"""
Chunked merge for large batch results
Merges batches in small chunks to avoid memory exhaustion
"""

import pandas as pd
import os
import json
import sys

def chunked_merge(completed_batches, chunk_size=10):
    """Merge batch results in chunks to avoid memory exhaustion"""
    
    # Sort batch numbers for consistent processing
    batch_nums = sorted(completed_batches)
    total_variants = 0
    
    print(f"🔄 Merging {len(batch_nums)} batches in chunks of {chunk_size}...")
    
    # Process in chunks
    temp_files = []
    for i in range(0, len(batch_nums), chunk_size):
        chunk_batches = batch_nums[i:i+chunk_size]
        print(f"   Processing chunk {i//chunk_size + 1}: batches {chunk_batches[0]}-{chunk_batches[-1]}")
        
        # Load chunk
        chunk_dfs = []
        for batch_num in chunk_batches:
            result_file = f'batch_{batch_num}_result.parquet'
            if os.path.exists(result_file):
                df = pd.read_parquet(result_file)
                chunk_dfs.append(df)
                total_variants += len(df)
        
        if chunk_dfs:
            # Merge chunk
            chunk_df = pd.concat(chunk_dfs, ignore_index=True)
            
            # Save temporary chunk file
            temp_file = f'temp_chunk_{i//chunk_size}.parquet'
            chunk_df.to_parquet(temp_file, compression='snappy')
            temp_files.append(temp_file)
            
            print(f"   ✓ Chunk saved: {len(chunk_df):,} variants")
            del chunk_df, chunk_dfs  # Free memory
    
    # Final merge of temp chunks
    print("   Final merge of chunks...")
    final_dfs = []
    for temp_file in temp_files:
        df = pd.read_parquet(temp_file)
        final_dfs.append(df)
    
    final_df = pd.concat(final_dfs, ignore_index=True)
    final_df = final_df.drop_duplicates('variant_id')
    
    # Save final result
    final_df.to_parquet('hypertension_smart.parquet', compression='snappy')
    
    # Cleanup temp files
    for temp_file in temp_files:
        os.unlink(temp_file)
    
    print(f"✅ Final merge complete: {len(final_df):,} unique variants")
    print(f"   File size: {os.path.getsize('hypertension_smart.parquet')/1024**2:.1f}MB")
    
    return len(final_df)

if __name__ == "__main__":
    # Load progress file
    with open('batch_progress.json') as f:
        progress = json.load(f)
        completed_batches = set(progress.get('completed_batches', []))
    
    chunked_merge(completed_batches)