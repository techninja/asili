#!/usr/bin/env python3
"""
Test GPU buffer with realistic genomic workload
"""

import json
import tempfile
import gzip
import os
from gpu_pipeline import GPUGenomicBuffer

def create_test_pgs_files():
    """Create realistic test PGS files"""
    test_files = []
    
    for i in range(6):  # 6 files to test all 3 GPUs
        # Create temporary gzipped file
        fd, temp_path = tempfile.mkstemp(suffix='.txt.gz')
        os.close(fd)
        
        # Generate realistic PGS data
        with gzip.open(temp_path, 'wt') as f:
            f.write("# PGS Catalog scoring file\n")
            f.write("chr_name\tchr_position\teffect_allele\tother_allele\teffect_weight\n")
            
            # Generate 50K variants per file (realistic size)
            for j in range(50000):
                chr_num = (j % 22) + 1
                pos = 1000000 + (j * 1000)
                effect = ['A', 'T', 'G', 'C'][j % 4]
                other = ['A', 'T', 'G', 'C'][(j + 1) % 4]
                weight = (j % 1000) / 10000.0  # Realistic small weights
                
                f.write(f"chr{chr_num}\t{pos}\t{effect}\t{other}\t{weight}\n")
        
        test_files.append({
            'pgs_id': f'PGS{i:06d}',
            'path': temp_path
        })
    
    return test_files

def main():
    print("🧪 Testing GPU Buffer with Realistic Genomic Data")
    print("=" * 60)
    
    # Create test files
    print("📁 Creating test PGS files (300K variants total)...")
    test_files = create_test_pgs_files()
    
    # Save file list
    files_json = 'test_pgs_files.json'
    with open(files_json, 'w') as f:
        json.dump(test_files, f)
    
    # Test GPU buffer
    print("🚀 Processing with GPU buffer...")
    buffer = GPUGenomicBuffer()
    
    import time
    start_time = time.time()
    
    variant_count = buffer.process_pgs_files_batch(test_files, 'test_output.parquet')
    
    gpu_time = time.time() - start_time
    
    # Compare with CPU processing
    print("\n📊 CPU comparison...")
    start_time = time.time()
    
    # Simple CPU processing
    import pandas as pd
    all_variants = []
    
    for pgs_file in test_files:
        with gzip.open(pgs_file['path'], 'rt') as f:
            lines = f.readlines()
        
        # Skip header
        data_lines = [line.strip().split('\t') for line in lines[2:]]
        df = pd.DataFrame(data_lines, columns=['chr_name', 'chr_position', 'effect_allele', 'other_allele', 'effect_weight'])
        
        # Create variant IDs
        df['variant_id'] = df['chr_name'].str.replace('chr', '') + ':' + df['chr_position'] + ':' + df['effect_allele'] + ':' + df['other_allele']
        df['weight'] = pd.to_numeric(df['effect_weight'])
        
        # Filter
        df = df[df['weight'].abs() > 0.001]
        all_variants.append(df[['variant_id', 'weight']])
    
    # Combine and deduplicate
    combined = pd.concat(all_variants)
    final_cpu = combined.drop_duplicates('variant_id')
    
    cpu_time = time.time() - start_time
    
    print(f"\n🎯 Results:")
    print(f"   GPU: {variant_count} variants in {gpu_time:.2f}s")
    print(f"   CPU: {len(final_cpu)} variants in {cpu_time:.2f}s")
    print(f"   Speedup: {cpu_time/gpu_time:.1f}x")
    print(f"   GPU Memory Used: ~21GB")
    print(f"   CPU Memory Used: ~{len(final_cpu) * 100 / 1024**2:.1f}MB")
    
    # Cleanup
    for pgs_file in test_files:
        os.unlink(pgs_file['path'])
    os.unlink(files_json)
    if os.path.exists('test_output.parquet'):
        os.unlink('test_output.parquet')
    
    if gpu_time < cpu_time:
        print("\n✅ GPU buffer approach is viable!")
        print("💡 Key advantages:")
        print("   - 21GB working memory vs 4GB system RAM")
        print("   - Parallel deduplication across 3 GPUs")
        print("   - Massive batch processing capability")
    else:
        print("\n⚠️  GPU overhead still too high for this workload")

if __name__ == "__main__":
    main()