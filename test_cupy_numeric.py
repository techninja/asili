#!/usr/bin/env python3
"""
CuPy-only test for GTX 1070 Ti - numeric operations only
"""

import cupy as cp
import numpy as np
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
    
    # Generate synthetic genomic data (numeric only)
    n_variants = 500000
    
    # CPU version
    start_time = time.time()
    chromosomes = np.random.randint(1, 23, n_variants)
    positions = np.random.randint(1000000, 250000000, n_variants)
    alleles1 = np.random.randint(0, 4, n_variants)  # 0=A, 1=T, 2=G, 3=C
    alleles2 = np.random.randint(0, 4, n_variants)
    weights = np.random.normal(0, 0.1, n_variants)
    
    # Create numeric variant IDs (hash-like)
    variant_ids_cpu = chromosomes * 1000000000 + positions
    
    # Filter and sort
    mask = np.abs(weights) > 0.05
    filtered_cpu = variant_ids_cpu[mask]
    filtered_cpu = np.unique(filtered_cpu)
    sorted_cpu = np.sort(filtered_cpu)
    
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
        gpu_chr = cp.array(chromosomes[start_idx:end_idx])
        gpu_pos = cp.array(positions[start_idx:end_idx])
        gpu_weights = cp.array(weights[start_idx:end_idx])
        
        # Create variant IDs on GPU
        gpu_variant_ids = gpu_chr * 1000000000 + gpu_pos
        
        # Filter significant variants on GPU
        mask_gpu = cp.abs(gpu_weights) > 0.05
        filtered_variants = gpu_variant_ids[mask_gpu]
        
        # Sort on GPU
        sorted_variants = cp.sort(filtered_variants)
        
        # Move result back to CPU
        gpu_results.append(cp.asnumpy(sorted_variants))
        print(f"   GPU {gpu_id}: Processed {len(filtered_variants)} variants")
    
    # Combine and deduplicate results
    all_filtered = np.concatenate(gpu_results)
    final_gpu = np.unique(all_filtered)
    
    gpu_time = time.time() - start_time
    
    print(f"✅ CPU processing: {len(sorted_cpu)} variants in {cpu_time:.2f}s")
    print(f"✅ GPU processing: {len(final_gpu)} variants in {gpu_time:.2f}s")
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
        print("💡 CuPy can accelerate numeric genomic operations")
    else:
        print("⚠️  Limited speedup - may not justify complexity")

if __name__ == "__main__":
    main()