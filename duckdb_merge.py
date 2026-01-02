#!/usr/bin/env python3
"""
DuckDB-based merge for large parquet files
Uses database engine instead of pandas for memory efficiency
"""

import duckdb
import json
import os
import sys

def duckdb_merge(completed_batches):
    """Use DuckDB to merge parquet files efficiently"""
    
    print(f"🦆 DuckDB merge: {len(completed_batches)} batches")
    
    # Create DuckDB connection
    conn = duckdb.connect(':memory:')
    
    # Build UNION ALL query for all batch files
    batch_nums = sorted(completed_batches)
    union_parts = []
    
    for batch_num in batch_nums:
        result_file = f'batch_{batch_num}_result.parquet'
        if os.path.exists(result_file):
            union_parts.append(f"SELECT * FROM '{result_file}'")
    
    if not union_parts:
        print("❌ No batch files found")
        return False
    
    # Create unified query
    union_query = " UNION ALL ".join(union_parts)
    
    print(f"   Merging {len(union_parts)} files...")
    
    # Execute merge with deduplication
    merge_query = f"""
    COPY (
        SELECT DISTINCT * FROM ({union_query})
        ORDER BY variant_id
    ) TO 'hypertension_smart.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """
    
    try:
        conn.execute(merge_query)
        
        # Get final count
        count_query = "SELECT COUNT(*) FROM 'hypertension_smart.parquet'"
        result = conn.execute(count_query).fetchone()
        variant_count = result[0]
        
        file_size = os.path.getsize('hypertension_smart.parquet') / 1024**2
        
        print(f"✅ DuckDB merge complete:")
        print(f"   Variants: {variant_count:,}")
        print(f"   File size: {file_size:.1f}MB")
        
        return True
        
    except Exception as e:
        print(f"❌ DuckDB merge failed: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    # Load progress file
    with open('batch_progress.json') as f:
        progress = json.load(f)
        completed_batches = set(progress.get('completed_batches', []))
    
    success = duckdb_merge(completed_batches)
    sys.exit(0 if success else 1)