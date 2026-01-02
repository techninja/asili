#!/usr/bin/env python3
"""
Merge existing completed batches with DuckDB
"""

import duckdb
import json
import os

# Load progress
with open('batch_progress.json') as f:
    progress = json.load(f)
    completed_batches = set(progress.get('completed_batches', []))

print(f"🦆 Merging {len(completed_batches)} completed batches with DuckDB...")

# Create connection
conn = duckdb.connect(':memory:')

# Build union query with explicit column selection
union_parts = []
for batch_num in sorted(completed_batches):
    result_file = f'batch_{batch_num}_result.parquet'
    if os.path.exists(result_file):
        union_parts.append(f"SELECT variant_id, weight FROM '{result_file}'")

print(f"   Found {len(union_parts)} batch files")

if union_parts:
    union_query = " UNION ALL ".join(union_parts)
    
    merge_query = f"""
    COPY (
        SELECT DISTINCT * FROM ({union_query})
        ORDER BY variant_id
    ) TO 'hypertension_partial.parquet' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """
    
    conn.execute(merge_query)
    
    # Get count
    count_result = conn.execute("SELECT COUNT(*) FROM 'hypertension_partial.parquet'").fetchone()
    variant_count = count_result[0]
    
    file_size = os.path.getsize('hypertension_partial.parquet') / 1024**2
    
    print(f"✅ Partial merge complete:")
    print(f"   Variants: {variant_count:,}")
    print(f"   File size: {file_size:.1f}MB")
else:
    print("❌ No batch files found")

conn.close()