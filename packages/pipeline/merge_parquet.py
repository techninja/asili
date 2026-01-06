#!/usr/bin/env python3
import pandas as pd
import sys
import os
import gc
from pathlib import Path
import pyarrow.parquet as pq
import pyarrow as pa

def merge_chunked(input_files, output_file, chunk_size=50000):
    """Merge files using chunked processing to minimize memory usage"""
    
    valid_files = []
    for file_path in input_files:
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            valid_files.append(file_path)
        else:
            print(f"Warning: Skipping invalid file: {file_path}")
    
    if not valid_files:
        print("Error: No valid files to merge")
        sys.exit(1)
    
    print(f"Chunked merge of {len(valid_files)} files (chunk size: {chunk_size:,})...")
    
    # Create parquet writer
    writer = None
    schema = None
    
    try:
        for i, file_path in enumerate(valid_files, 1):
            print(f"  Processing file {i}/{len(valid_files)}: {Path(file_path).name}")
            
            # Read file in chunks
            parquet_file = pq.ParquetFile(file_path)
            
            for batch_idx, batch in enumerate(parquet_file.iter_batches(batch_size=chunk_size)):
                table = pa.Table.from_batches([batch])
                
                if writer is None:
                    schema = table.schema
                    writer = pq.ParquetWriter(output_file, schema, compression='snappy')
                
                writer.write_table(table)
                
                # Force garbage collection
                del table, batch
                gc.collect()
        
        if writer:
            writer.close()
        
        size_mb = os.path.getsize(output_file) / (1024 * 1024)
        print(f"✓ Merged {len(valid_files)} files into {output_file} ({size_mb:.1f}MB)")
        
    except Exception as e:
        if writer:
            writer.close()
        raise e

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 merge_parquet.py <input_file1> <input_file2> ... <output_file>")
        sys.exit(1)
    
    input_files = sys.argv[1:-1]
    output_file = sys.argv[-1]
    
    merge_chunked(input_files, output_file)