#!/usr/bin/env python3
"""
CUDA PGS Calculator - Python wrapper
Loads PLINK data and calls CUDA kernel for GPU-accelerated scoring
"""

import ctypes
import numpy as np
from pathlib import Path

# Load compiled CUDA library
lib = ctypes.CDLL('./libpgs.so')
lib.cuda_calculate_pgs.argtypes = [
    ctypes.POINTER(ctypes.c_char),
    ctypes.POINTER(ctypes.c_float),
    ctypes.POINTER(ctypes.c_float),
    ctypes.c_int,
    ctypes.c_int
]

def load_plink_bed(prefix):
    """Load PLINK .bed file into genotype matrix"""
    bed_file = f"{prefix}.bed"
    fam_file = f"{prefix}.fam"
    bim_file = f"{prefix}.bim"
    
    n_samples = sum(1 for _ in open(fam_file))
    n_variants = sum(1 for _ in open(bim_file))
    
    # Read .bed file (PLINK binary format)
    with open(bed_file, 'rb') as f:
        magic = f.read(3)
        assert magic == b'\x6c\x1b\x01', "Invalid PLINK .bed file"
        
        genotypes = np.zeros((n_samples, n_variants), dtype=np.int8)
        
        for v in range(n_variants):
            bytes_per_variant = (n_samples + 3) // 4
            data = f.read(bytes_per_variant)
            
            for i, byte in enumerate(data):
                for j in range(4):
                    sample_idx = i * 4 + j
                    if sample_idx >= n_samples:
                        break
                    
                    geno = (byte >> (j * 2)) & 0x3
                    # PLINK encoding: 00=hom ref, 01=missing, 10=het, 11=hom alt
                    if geno == 0: genotypes[sample_idx, v] = 2
                    elif geno == 2: genotypes[sample_idx, v] = 1
                    elif geno == 3: genotypes[sample_idx, v] = 0
                    else: genotypes[sample_idx, v] = 0  # missing -> 0
    
    return genotypes, n_samples, n_variants

def calculate_pgs_cuda(plink_prefix, weights):
    """Calculate PGS using CUDA"""
    genotypes, n_samples, n_variants = load_plink_bed(plink_prefix)
    
    # Prepare data
    geno_flat = genotypes.flatten().astype(np.int8)
    weights_arr = np.array(weights, dtype=np.float32)
    scores = np.zeros(n_samples, dtype=np.float32)
    
    # Call CUDA kernel
    lib.cuda_calculate_pgs(
        geno_flat.ctypes.data_as(ctypes.POINTER(ctypes.c_char)),
        weights_arr.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
        scores.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
        n_samples,
        n_variants
    )
    
    return scores

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python cuda_pgs.py <plink_prefix> <weights_file>")
        sys.exit(1)
    
    plink_prefix = sys.argv[1]
    weights_file = sys.argv[2]
    
    # Load weights
    weights = np.loadtxt(weights_file, dtype=np.float32)
    
    # Calculate
    scores = calculate_pgs_cuda(plink_prefix, weights)
    
    # Output
    for i, score in enumerate(scores):
        print(f"Sample_{i}: {score:.6f}")
