#!/usr/bin/env python3
"""
Validate parquet file and show basic stats
"""

import pandas as pd
import sys
import os

def validate_parquet(filename):
    if not os.path.exists(filename):
        print(f"❌ File not found: {filename}")
        return False
    
    try:
        print(f"📊 Loading {filename}...")
        df = pd.read_parquet(filename)
        
        print(f"✅ File loaded successfully")
        print(f"   Rows: {len(df):,}")
        print(f"   Columns: {list(df.columns)}")
        print(f"   File size: {os.path.getsize(filename)/1024**2:.1f}MB")
        
        if 'variant_id' in df.columns:
            unique_variants = df['variant_id'].nunique()
            print(f"   Unique variants: {unique_variants:,}")
            
            if unique_variants != len(df):
                print(f"   ⚠️  Duplicates found: {len(df) - unique_variants:,}")
        
        if 'weight' in df.columns:
            print(f"   Weight range: {df['weight'].min():.6f} to {df['weight'].max():.6f}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False

if __name__ == "__main__":
    filename = sys.argv[1] if len(sys.argv) > 1 else "hypertension_smart.parquet"
    validate_parquet(filename)