#!/usr/bin/env python3
"""
GPU Memory Buffer for Genomic Pipeline
Uses 21GB GPU memory as massive parallel processing buffer
"""

import cupy as cp
import numpy as np
import pandas as pd
import gzip
import time
import json
import sys
from pathlib import Path

class GPUGenomicBuffer:
    def __init__(self):
        self.gpu_count = 3
        self.memory_per_gpu = 6 * 1024**3  # 6GB per GPU
        self.total_gpu_memory = 21 * 1024**3  # 21GB total
        
        # Initialize all GPUs
        for i in range(self.gpu_count):
            cp.cuda.Device(i).use()
            mempool = cp.get_default_memory_pool()
            mempool.set_limit(size=self.memory_per_gpu)
    
    def process_pgs_files_batch(self, pgs_files, output_path):
        """Process multiple PGS files using GPU as massive buffer"""
        print(f"🚀 GPU Buffer: Processing {len(pgs_files)} files...")
        
        # Phase 1: Load all files into GPU memory buffers
        gpu_chunks = []
        total_variants = 0
        
        for gpu_id in range(self.gpu_count):
            cp.cuda.Device(gpu_id).use()
            gpu_chunks.append([])
        
        # Distribute files across GPUs
        for i, pgs_file in enumerate(pgs_files):
            gpu_id = i % self.gpu_count
            cp.cuda.Device(gpu_id).use()
            
            print(f"   Loading {pgs_file['pgs_id']} -> GPU {gpu_id}")
            
            # Load and parse file
            variants = self._load_pgs_file(pgs_file['path'])
            if variants is None:
                continue
                
            # Convert to GPU arrays
            gpu_variants = self._to_gpu_format(variants, pgs_file['pgs_id'])
            gpu_chunks[gpu_id].append(gpu_variants)
            total_variants += len(gpu_variants['chr'])
        
        print(f"   Loaded {total_variants} variants across {self.gpu_count} GPUs")
        
        # Phase 2: Parallel processing on each GPU
        processed_chunks = []
        for gpu_id in range(self.gpu_count):
            if not gpu_chunks[gpu_id]:
                continue
                
            cp.cuda.Device(gpu_id).use()
            print(f"   GPU {gpu_id}: Processing {len(gpu_chunks[gpu_id])} files...")
            
            # Combine all files on this GPU
            combined = self._combine_gpu_chunks(gpu_chunks[gpu_id])
            
            # Generate variant IDs in parallel
            variant_ids = self._generate_variant_ids_gpu(combined)
            
            # Filter and deduplicate
            filtered = self._filter_and_dedupe_gpu(combined, variant_ids)
            
            processed_chunks.append(filtered)
            print(f"   GPU {gpu_id}: {len(filtered['variant_id'])} unique variants")
        
        # Phase 3: Final merge on GPU 0
        cp.cuda.Device(0).use()
        print("   Final merge and sort...")
        
        final_result = self._merge_final_gpu(processed_chunks)
        
        # Phase 4: Export to parquet
        self._export_to_parquet(final_result, output_path)
        
        return len(final_result['variant_id'])
    
    def _load_pgs_file(self, file_path):
        """Load PGS file with exact format detection from original pipeline"""
        try:
            with gzip.open(file_path, 'rt') as f:
                lines = f.readlines()
            
            # Find header (skip comments)
            header_idx = None
            for i, line in enumerate(lines):
                if not line.startswith('#') and line.strip():
                    header_idx = i
                    break
            
            if header_idx is None:
                return None
                
            header = lines[header_idx].strip().split('\t')
            columns = header
            
            # Extract data lines (skip comments)
            data_lines = []
            for line in lines[header_idx+1:]:
                if line.strip() and not line.startswith('#'):
                    parts = line.strip().split('\t')
                    if len(parts) == len(header):  # Handle column mismatches
                        data_lines.append(parts)
            
            if len(data_lines) < 100:
                return None
            
            # Format detection (exact match to original pipeline)
            if 'chr_name' in columns and 'chr_position' in columns and 'rsID' in columns:
                format_type = 'STANDARD_SNP'
            elif 'chr_name' in columns and 'chr_position' in columns and 'rsID' not in columns:
                format_type = 'STANDARD_SNP_NO_RSID'
            elif 'rsID' in columns and 'is_haplotype' in columns:
                format_type = 'HLA_ALLELE'
            elif 'rsID' in columns and 'chr_name' not in columns and 'is_haplotype' not in columns:
                format_type = 'RSID_ONLY'
            elif 'rsID' in columns and 'chr_name' in columns and 'chr_position' not in columns:
                format_type = 'RSID_CHR'
            else:
                print(f"Unsupported format - columns: {', '.join(columns)}")
                return None
            
            print(f"        Detected {format_type} format")
            
            # Create DataFrame
            df = pd.DataFrame(data_lines, columns=header)
            
            # Process based on format (matching original logic)
            if format_type in ['STANDARD_SNP', 'STANDARD_SNP_NO_RSID']:
                # Clean chromosome names and convert to numeric
                chr_clean = df['chr_name'].str.replace('chr', '')
                chr_numeric = []
                for c in chr_clean:
                    if c == 'X': chr_numeric.append(23)
                    elif c == 'Y': chr_numeric.append(24)
                    elif c in ['MT', 'M']: chr_numeric.append(25)
                    else:
                        try: chr_numeric.append(int(c))
                        except: chr_numeric.append(0)
                
                # Convert positions
                pos_numeric = []
                for p in df['chr_position']:
                    try: pos_numeric.append(int(p))
                    except: pos_numeric.append(0)
                
                return {
                    'format_type': format_type,
                    'chr': np.array(chr_numeric, dtype=np.int32),
                    'pos': np.array(pos_numeric, dtype=np.int32),
                    'effect_allele': df['effect_allele'].values,
                    'other_allele': df.get('other_allele', [''] * len(df)).values,
                    'weight': pd.to_numeric(df['effect_weight'], errors='coerce').fillna(0).values
                }
            
            elif format_type == 'HLA_ALLELE':
                return {
                    'format_type': format_type,
                    'rsid': df['rsID'].values,
                    'effect_allele': df['effect_allele'].values,
                    'weight': pd.to_numeric(df['effect_weight'], errors='coerce').fillna(0).values
                }
            
            else:  # RSID_ONLY, RSID_CHR
                return {
                    'format_type': format_type,
                    'rsid': df['rsID'].values,
                    'effect_allele': df['effect_allele'].values,
                    'other_allele': df.get('other_allele', [''] * len(df)).values,
                    'weight': pd.to_numeric(df['effect_weight'], errors='coerce').fillna(0).values
                }
            
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
            return None
    
    def _to_gpu_format(self, variants, pgs_id):
        """Convert variants to GPU arrays with proper type handling"""
        gpu_variants = {}
        
        for key, values in variants.items():
            if key in ['chr', 'pos'] and len(values) > 0 and isinstance(values[0], (int, np.integer)):
                # Numeric arrays - safe for GPU
                gpu_variants[key] = cp.array(values, dtype=cp.int32)
            elif key == 'weight' and len(values) > 0:
                # Float weights
                gpu_variants[key] = cp.array(values, dtype=cp.float32)
            else:
                # Keep strings on CPU
                gpu_variants[key] = values
        
        gpu_variants['pgs_id'] = pgs_id
        return gpu_variants
    
    def _combine_gpu_chunks(self, chunks):
        """Combine multiple files on same GPU"""
        if len(chunks) == 1:
            return chunks[0]
        
        combined = {}
        for key in chunks[0].keys():
            if key == 'pgs_id':
                continue
            
            if isinstance(chunks[0][key], cp.ndarray):
                # GPU arrays - concatenate
                arrays = [chunk[key] for chunk in chunks if hasattr(chunk[key], 'shape') and chunk[key].size > 0]
                if arrays:
                    combined[key] = cp.concatenate(arrays)
                else:
                    combined[key] = cp.array([])
            else:
                # CPU arrays - concatenate  
                arrays = [chunk[key] for chunk in chunks if hasattr(chunk[key], 'shape') and chunk[key].size > 0]
                if arrays:
                    combined[key] = np.concatenate(arrays)
                else:
                    combined[key] = np.array([])
        
        return combined
    
    def _generate_variant_ids_gpu(self, variants):
        """Generate variant IDs using GPU parallel processing"""
        if 'chr' in variants and 'pos' in variants:
            # Position-based IDs: chr:pos:effect:other
            # Use GPU for numeric operations, CPU for string concat
            chr_pos = variants['chr'] * 1000000000 + variants['pos']
            return cp.asnumpy(chr_pos)  # Convert back for string operations
        else:
            # rsID-based
            return variants.get('rsid', np.array([]))
    
    def _filter_and_dedupe_gpu(self, variants, variant_ids):
        """Filter and deduplicate using GPU sorting"""
        # Check if we have any data
        if len(variant_ids) == 0:
            return {'variant_id': np.array([]), 'weight': np.array([])}
        
        # Filter valid weights on GPU
        if isinstance(variants['weight'], cp.ndarray) and variants['weight'].size > 0:
            weight_mask = cp.abs(variants['weight']) > 0.001
        else:
            weight_array = np.array(variants['weight']) if not isinstance(variants['weight'], np.ndarray) else variants['weight']
            if weight_array.size == 0:
                return {'variant_id': np.array([]), 'weight': np.array([])}
            weight_mask = cp.array(np.abs(weight_array) > 0.001)
        
        weight_mask_cpu = weight_mask.get() if isinstance(weight_mask, cp.ndarray) else weight_mask
        
        # Apply filter (handle strings on CPU)
        filtered = {}
        for key, values in variants.items():
            if isinstance(values, cp.ndarray) and values.size > 0:
                filtered[key] = values[weight_mask].get()
            elif hasattr(values, '__len__') and len(values) > 0:
                # Handle strings on CPU
                if isinstance(values, np.ndarray) and values.dtype == object:
                    filtered[key] = values[weight_mask_cpu]
                else:
                    try:
                        gpu_values = cp.array(values)
                        filtered[key] = gpu_values[weight_mask].get()
                    except ValueError:  # Unsupported dtype (strings)
                        values_array = np.array(values)
                        if values_array.ndim == 0:
                            filtered[key] = values_array if weight_mask_cpu.any() else np.array([])
                        else:
                            filtered[key] = values_array[weight_mask_cpu]
            else:
                filtered[key] = np.array([])
        
        # Filter variant IDs on CPU
        filtered_ids = np.array(variant_ids)[weight_mask_cpu] if len(variant_ids) > 0 else np.array([])
        
        # GPU-accelerated deduplication for numeric IDs
        if len(filtered_ids) > 0:
            try:
                unique_ids, unique_indices = cp.unique(cp.array(filtered_ids), return_index=True)
                unique_indices_cpu = unique_indices.get()
                
                # Keep only unique variants
                for key, values in filtered.items():
                    if hasattr(values, '__len__') and len(values) > 0:
                        filtered[key] = values[unique_indices_cpu]
                
                filtered['variant_id'] = unique_ids.get()
            except ValueError:  # String variant IDs
                unique_ids, unique_indices = np.unique(filtered_ids, return_index=True)
                
                for key, values in filtered.items():
                    if hasattr(values, '__len__') and len(values) > 0:
                        filtered[key] = values[unique_indices]
                
                filtered['variant_id'] = unique_ids
        else:
            filtered['variant_id'] = np.array([])
        
        return filtered
    
    def _merge_final_gpu(self, chunks):
        """Final merge of all GPU results"""
        if len(chunks) == 1:
            return chunks[0]
        
        # Combine all chunks
        all_variant_ids = np.concatenate([chunk['variant_id'] for chunk in chunks])
        all_weights = np.concatenate([chunk['weight'] for chunk in chunks])
        
        # Final GPU deduplication
        gpu_ids = cp.array(all_variant_ids)
        gpu_weights = cp.array(all_weights)
        
        unique_ids, unique_indices = cp.unique(gpu_ids, return_index=True)
        unique_weights = gpu_weights[unique_indices]
        
        return {
            'variant_id': cp.asnumpy(unique_ids),
            'weight': cp.asnumpy(unique_weights)
        }
    
    def _export_to_parquet(self, data, output_path):
        """Export final result to parquet"""
        df = pd.DataFrame(data)
        df.to_parquet(output_path, compression='snappy')
        print(f"   Exported {len(df)} variants to {output_path}")

def main():
    if len(sys.argv) < 3:
        print("Usage: python gpu_pipeline.py <pgs_files.json> <output.parquet>")
        return
    
    pgs_files_path = sys.argv[1]
    output_path = sys.argv[2]
    
    # Load PGS file list
    with open(pgs_files_path) as f:
        pgs_files = json.load(f)
    
    # Process with GPU buffer
    buffer = GPUGenomicBuffer()
    variant_count = buffer.process_pgs_files_batch(pgs_files, output_path)
    
    print(f"✅ Processed {variant_count} variants using 21GB GPU buffer")

if __name__ == "__main__":
    main()