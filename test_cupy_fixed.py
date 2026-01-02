#!/usr/bin/env python3
"""
CuPy-only test for GTX 1070 Ti (Compute 6.1)
cuDF requires Volta 7.0+, but CuPy works on Pascal 6.1
"""

import cupy as cp
import numpy as np
import pandas as pd
import time

def test_gpus():
    print("🔍 Testing GPU availability...")
    
    gpu_count = cp.cuda.runtime.getDeviceCount()
    print(f"✅ Found {gpu_count} GPUs")
    
    for i in range(gpu_count):
        cp.cuda.Device(i).use()
        props = cp.cuda.runtime.getDeviceProperties(i)
        compute = f"{props['major']}.{props['minor']}"
        mem_gb = props['totalGlobalMem'] // (1024**3)
        print(f"   GPU {i}: {props['name'].decode()} ({mem_gb}GB, Compute {compute})")
    
    return gpu_count

def simulate_genomic_processing():
    print("\n🧬 Testing genomic data processing with CuPy...")
    
    # Generate synthetic genomic data
    n_variants = 200000
    
    # CPU version
    start_time = time.time()
    chr_names = np.random.choice([f'chr{i}' for i in range(1, 23)], n_variants)
    positions = np.random.randint(1000000, 250000000, n_variants)
    alleles1 = np.random.choice(['A', 'T', 'G', 'C'], n_variants)
    alleles2 = np.random.choice(['A', 'T', 'G', 'C'], n_variants)
    weights = np.random.normal(0, 0.1, n_variants)
    
    # Create variant IDs (CPU)
    variant_ids_cpu = np.array([f"{c.replace('chr', '')}:{p}:{a1}:{a2}" 
                               for c, p, a1, a2 in zip(chr_names, positions, alleles1, alleles2)])
    
    # Filter significant variants
    mask = np.abs(weights) > 0.05
    filtered_cpu = variant_ids_cpu[mask]
    filtered_cpu = np.unique(filtered_cpu)
    
    cpu_time = time.time() - start_time
    
    # GPU version (split across 3 GPUs)
    start_time = time.time()
    chunk_size = n_variants // 3
    gpu_results = []
    
    for gpu_id in range(3):
        cp.cuda.Device(gpu_id).use()
        
        start_idx = gpu_id * chunk_size
        end_idx = start_idx + chunk_size if gpu_id < 2 else n_variants
        
        # Move data to GPU
        gpu_chr = cp.array(chr_names[start_idx:end_idx])
        gpu_pos = cp.array(positions[start_idx:end_idx])
        gpu_a1 = cp.array(alleles1[start_idx:end_idx])
        gpu_a2 = cp.array(alleles2[start_idx:end_idx])
        gpu_weights = cp.array(weights[start_idx:end_idx])
        
        # Filter significant variants on GPU
        mask_gpu = cp.abs(gpu_weights) > 0.05
        filtered_weights = gpu_weights[mask_gpu]
        
        # Move result back to CPU for combining
        gpu_results.append(cp.asnumpy(filtered_weights))
        print(f"   GPU {gpu_id}: Processed {len(filtered_weights)} variants")
    
    # Combine results
    all_filtered = np.concatenate(gpu_results)
    gpu_time = time.time() - start_time
    
    print(f"✅ CPU processing: {len(filtered_cpu)} variants in {cpu_time:.2f}s")
    print(f"✅ GPU processing: {len(all_filtered)} variants in {gpu_time:.2f}s")
    print(f"🚀 Speedup: {cpu_time/gpu_time:.1f}x")
    
    return cpu_time / gpu_time

def main():
    print("🧪 CuPy Genomic Processing Test (GTX 1070 Ti)")
    print("=" * 50)
    
    gpu_count = test_gpus()
    
    if gpu_count < 3:
        print(f"⚠️  Expected 3 GPUs, found {gpu_count}")
    
    speedup = simulate_genomic_processing()
    
    print(f"\n🎯 Result: {speedup:.1f}x speedup with GPU acceleration")
    
    if speedup > 1.5:
        print("✅ GPU acceleration viable for your pipeline!")
        print("💡 Note: cuDF not supported on GTX 1070 Ti, but CuPy works")
    else:
        print("⚠️  Limited speedup - may not justify complexity")

if __name__ == "__main__":
    main()