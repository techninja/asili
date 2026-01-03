#!/usr/bin/env python3
"""
Pure DuckDB genomic processor - no pandas, no GPU, minimal memory
"""

import duckdb
import json
import sys
import os

def process_batch_with_duckdb(batch_files, output_file):
    """Process batch using only DuckDB - no Python data structures"""
    
    conn = duckdb.connect(':memory:')
    
    try:
        # Create temp table
        conn.execute("""
            CREATE TABLE variants (
                variant_id VARCHAR,
                weight DOUBLE
            )
        """)
        
        for file_info in batch_files:
            file_path = file_info['path']
            pgs_id = file_info['pgs_id']
            
            print(f"   Processing {pgs_id}...")
            
            # Read file directly with DuckDB
            try:
                # Use DuckDB to read compressed file and process
                conn.execute(f"""
                    INSERT INTO variants
                    SELECT 
                        CASE 
                            WHEN column0 LIKE 'rs%' THEN column0
                            ELSE CONCAT(column0, ':', column1, ':', column2, ':', column3)
                        END as variant_id,
                        TRY_CAST(column4 AS DOUBLE) as weight
                    FROM read_csv('{file_path}', 
                        delim='\t', 
                        header=false, 
                        skip=1,
                        compression='gzip',
                        ignore_errors=true
                    )
                    WHERE column4 IS NOT NULL 
                      AND column4 != ''
                      AND TRY_CAST(column4 AS DOUBLE) IS NOT NULL
                """)
            except Exception as e:
                print(f"   Warning: {pgs_id} failed: {e}")
                continue
        
        # Export results
        conn.execute(f"""
            COPY (
                SELECT DISTINCT variant_id, weight 
                FROM variants 
                ORDER BY variant_id
            ) TO '{output_file}' (FORMAT PARQUET, COMPRESSION SNAPPY)
        """)
        
        # Get count
        result = conn.execute("SELECT COUNT(*) FROM variants").fetchone()
        variant_count = result[0]
        
        print(f"   Exported {variant_count:,} variants")
        return True
        
    except Exception as e:
        print(f"   DuckDB processing failed: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python duckdb_processor.py <batch_files.json> <output.parquet>")
        sys.exit(1)
    
    batch_file = sys.argv[1]
    output_file = sys.argv[2]
    
    with open(batch_file) as f:
        batch_files = json.load(f)
    
    success = process_batch_with_duckdb(batch_files, output_file)
    sys.exit(0 if success else 1)