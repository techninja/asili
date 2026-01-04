#!/usr/bin/env python3
import pandas as pd
import sys
import os
from pathlib import Path

def merge_one_at_a_time(input_files, output_file):
    """Merge files one at a time into output file to minimize memory usage"""
    
    valid_files = []
    for file_path in input_files:
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            valid_files.append(file_path)
        else:
            print(f"Warning: Skipping invalid file: {file_path}")
    
    if not valid_files:
        print("Error: No valid files to merge")
        sys.exit(1)
    
    print(f"Merging {len(valid_files)} files one at a time...")
    
    # Start with first file
    print(f"  Starting with: {Path(valid_files[0]).name}")
    result_df = pd.read_parquet(valid_files[0])
    
    # Merge each subsequent file one at a time
    for i, file_path in enumerate(valid_files[1:], 2):
        print(f"  Merging file {i}/{len(valid_files)}: {Path(file_path).name}")
        
        df = pd.read_parquet(file_path)
        result_df = pd.concat([result_df, df], ignore_index=True)
        
        # Clean up memory
        del df
    
    print(f"Writing final file: {output_file}")
    result_df.to_parquet(output_file, compression='snappy', index=False)
    
    size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"✓ Merged {len(valid_files)} files into {output_file} ({size_mb:.1f}MB)")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 merge_parquet.py <input_file1> <input_file2> ... <output_file>")
        sys.exit(1)
    
    input_files = sys.argv[1:-1]
    output_file = sys.argv[-1]
    
    merge_one_at_a_time(input_files, output_file)