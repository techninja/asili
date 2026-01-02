#!/usr/bin/env python3
"""
Minimal CUDA test for 3x GTX 1080 Ti on Ubuntu
Tests GPU availability and basic genomic data processing
"""

import cupy as cp
import cudf
import pandas as pd
import numpy as np
import time
import sys

def test_gpus():
    """Test all 3 GPUs"""
    print("🔍 Testing GPU availability...")
    
    if not cp.cuda.is_available():
        print("❌ CUDA not available")
        return False
    
    gpu_count = cp.cuda.runtime.getDeviceCount()
    print(f"✅ Found {gpu_count} GPUs")
    
    for i in range(min(3, gpu_count)):
        cp.cuda.Device(i).use()
        props = cp.cuda.runtime.getDeviceProperties(i)
        mem_gb = props['totalGlobalMem'] // (1024**3)
        print(f"   GPU {i}: {props['name'].decode()} ({mem_gb}GB)")
    
    return gpu_count >= 3

def simulate_genomic_processing():
    """Simulate processing genomic variants across 3 GPUs"""
    print("\n🧬 Testing genomic data processing...")
    
    # Generate synthetic genomic data (like PGS variants)
    n_variants = 200000
    synthetic_data = {
        'chr_name': [f'chr{np.random.randint(1, 23)}' for _ in range(n_variants)],
        'chr_position': np.random.randint(1000000, 250000000, n_variants),
        'effect_allele': np.random.choice(['A', 'T', 'G', 'C'], n_variants),
        'other_allele': np.random.choice(['A', 'T', 'G', 'C'], n_variants),
        'effect_weight': np.random.normal(0, 0.1, n_variants)
    }
    
    # Split data across 3 GPUs
    chunk_size = n_variants // 3
    results = []
    
    start_time = time.time()
    
    for gpu_id in range(3):
        cp.cuda.Device(gpu_id).use()
        
        # Get chunk for this GPU
        start_idx = gpu_id * chunk_size
        end_idx = start_idx + chunk_size if gpu_id < 2 else n_variants
        
        chunk_data = {k: v[start_idx:end_idx] for k, v in synthetic_data.items()}
        
        # Process on GPU
        df = cudf.DataFrame(chunk_data)
        
        # Create variant IDs (typical genomic processing)
        df['chr_clean'] = df['chr_name'].str.replace('chr', '')
        df['variant_id'] = (df['chr_clean'].astype(str) + ':' + 
                           df['chr_position'].astype(str) + ':' + 
                           df['effect_allele'] + ':' + 
                           df['other_allele'])
        
        # Filter and sort
        df = df[df['effect_weight'].abs() > 0.05]  # Filter significant variants
        df = df.sort_values('variant_id')
        
        results.append(df)
        print(f"   GPU {gpu_id}: Processed {len(df)} variants")
    
    # Combine results on GPU 0
    cp.cuda.Device(0).use()
    combined = cudf.concat(results, ignore_index=True)
    combined = combined.drop_duplicates('variant_id')
    
    gpu_time = time.time() - start_time
    
    print(f"✅ GPU processing: {len(combined)} variants in {gpu_time:.2f}s")
    
    # Compare with CPU
    start_time = time.time()
    df_cpu = pd.DataFrame(synthetic_data)
    df_cpu['variant_id'] = (df_cpu['chr_name'].str.replace('chr', '') + ':' + 
                           df_cpu['chr_position'].astype(str) + ':' + 
                           df_cpu['effect_allele'] + ':' + 
                           df_cpu['other_allele'])
    df_cpu = df_cpu[df_cpu['effect_weight'].abs() > 0.05]
    df_cpu = df_cpu.sort_values('variant_id').drop_duplicates('variant_id')
    
    cpu_time = time.time() - start_time
    
    print(f"📊 CPU processing: {len(df_cpu)} variants in {cpu_time:.2f}s")
    print(f"🚀 Speedup: {cpu_time/gpu_time:.1f}x")
    
    return cpu_time / gpu_time

def main():
    print("🧪 CUDA Genomic Processing Test")
    print("=" * 40)
    
    if not test_gpus():
        sys.exit(1)
    
    speedup = simulate_genomic_processing()
    
    print(f"\n🎯 Result: {speedup:.1f}x speedup with GPU acceleration")
    
    if speedup > 2.0:
        print("✅ GPU acceleration viable for your pipeline!")
    else:
        print("⚠️  Limited speedup - may not justify complexity")

if __name__ == "__main__":
    main()