#!/usr/bin/env python3
"""
Memory-safe genomic pipeline orchestrator
Only manages file paths and subprocess execution - never loads data
"""

import subprocess
import json
import os
import sys
from pathlib import Path

class GenomicOrchestrator:
    def __init__(self, trait_name="hypertension", max_variants_per_batch=100000):
        self.trait_name = trait_name
        self.max_variants_per_batch = max_variants_per_batch
        self.progress_file = f"{trait_name}_progress.json"
        
    def load_progress(self):
        """Load progress from disk - only file paths, no data"""
        if os.path.exists(self.progress_file):
            with open(self.progress_file) as f:
                return json.load(f)
        return {"completed_batches": [], "batch_files": []}
    
    def save_progress(self, progress):
        """Save progress to disk"""
        with open(self.progress_file, 'w') as f:
            json.dump(progress, f)
    
    def get_actual_variant_count(self, file_path):
        """Count variants without loading full file into memory"""
        try:
            import gzip
            with gzip.open(file_path, 'rt') as f:
                count = 0
                for line in f:
                    if not line.startswith('#') and line.strip():
                        count += 1
                return max(0, count - 1)  # Subtract header
        except:
            return 50000  # Conservative fallback
    
    def create_batches(self, pgs_ids):
        """Create batch file lists with actual variant counts"""
        print(f"📦 Analyzing {len(pgs_ids)} PGS files...")
        
        # Get actual variant counts
        file_info = []
        for pgs_id in pgs_ids:
            cache_path = Path("pgs_cache") / f"{pgs_id}.txt.gz"
            if cache_path.exists():
                variant_count = self.get_actual_variant_count(cache_path)
                file_info.append({
                    "pgs_id": pgs_id,
                    "path": str(cache_path),
                    "variants": variant_count
                })
                print(f"   {pgs_id}: {variant_count:,} variants")
        
        # Create batches based on actual variant counts
        batches = []
        current_batch = []
        current_count = 0
        
        for file in file_info:
            if current_count + file["variants"] > self.max_variants_per_batch and current_batch:
                batches.append(current_batch)
                current_batch = []
                current_count = 0
            
            current_batch.append(file)
            current_count += file["variants"]
        
        if current_batch:
            batches.append(current_batch)
        
        print(f"   Created {len(batches)} batches")
        return batches
    
    def process_single_batch(self, batch_files, batch_num):
        """Process single batch via subprocess - no data in memory"""
        batch_file = f"batch_{batch_num}_files.json"
        output_file = f"batch_{batch_num}_result.parquet"
        
        # Write batch file list to disk
        with open(batch_file, 'w') as f:
            json.dump(batch_files, f)
        
        # Run GPU pipeline subprocess
        cmd = [sys.executable, "gpu_pipeline.py", batch_file, output_file]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        # Cleanup batch file
        os.unlink(batch_file)
        
        if result.returncode == 0 and os.path.exists(output_file):
            return True
        else:
            print(f"   Batch {batch_num} failed:")
            print(f"   Return code: {result.returncode}")
            if result.stdout:
                print(f"   Stdout: {result.stdout}")
            if result.stderr:
                print(f"   Stderr: {result.stderr}")
            return False
    
    def merge_results(self, completed_batches):
        """Merge results via DuckDB subprocess - no data in memory"""
        print(f"🦆 Merging {len(completed_batches)} batches...")
        
        # Create merge script input
        merge_input = {"completed_batches": list(completed_batches)}
        with open("merge_input.json", 'w') as f:
            json.dump(merge_input, f)
        
        # Run DuckDB merge subprocess
        cmd = [sys.executable, "duckdb_merge.py"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Cleanup
        os.unlink("merge_input.json")
        
        if result.returncode == 0:
            print(result.stdout.strip())
            return True
        else:
            print(f"Merge failed:")
            print(f"Return code: {result.returncode}")
            if result.stdout:
                print(f"Stdout: {result.stdout}")
            if result.stderr:
                print(f"Stderr: {result.stderr}")
            return False
    
    def run_pipeline(self, pgs_ids):
        """Run complete pipeline with memory isolation"""
        print(f"🧬 Starting {self.trait_name} pipeline")
        print(f"   Target: {len(pgs_ids)} PGS files")
        print(f"   Batch size: {self.max_variants_per_batch:,} variants")
        
        # Load progress
        progress = self.load_progress()
        completed_batches = set(progress["completed_batches"])
        
        # Create batches
        batches = self.create_batches(pgs_ids)
        
        # Process each batch
        for batch_num, batch_files in enumerate(batches, 1):
            if batch_num in completed_batches:
                print(f"   Batch {batch_num}: ✅ DONE")
                continue
            
            print(f"   Batch {batch_num}: Processing {len(batch_files)} files...")
            
            if self.process_single_batch(batch_files, batch_num):
                completed_batches.add(batch_num)
                progress["completed_batches"] = list(completed_batches)
                self.save_progress(progress)
                print(f"   Batch {batch_num}: ✅ COMPLETE")
            else:
                print(f"   Batch {batch_num}: ❌ FAILED")
                break
        
        # Final merge
        if completed_batches:
            if self.merge_results(completed_batches):
                # Cleanup batch files
                for batch_num in completed_batches:
                    result_file = f"batch_{batch_num}_result.parquet"
                    if os.path.exists(result_file):
                        os.unlink(result_file)
                os.unlink(self.progress_file)
                print("✅ Pipeline complete!")
            else:
                print("❌ Merge failed")

def main():
    # Hypertension PGS IDs
    pgs_ids = [
        "PGS000706", "PGS001320", "PGS001838", "PGS002047", "PGS002296",
        "PGS002335", "PGS002407", "PGS002456", "PGS002505", "PGS002554",
        "PGS002603", "PGS002652", "PGS002701", "PGS002765", "PGS002777",
        "PGS002778", "PGS002994", "PGS002995", "PGS002996", "PGS002997",
        "PGS002998", "PGS002999", "PGS003000", "PGS003001", "PGS003002",
        "PGS003003", "PGS003004", "PGS003005", "PGS003006", "PGS003007",
        "PGS003008", "PGS003009", "PGS003010", "PGS003011", "PGS003012",
        "PGS003013", "PGS003014", "PGS003015", "PGS003016", "PGS003017",
        "PGS003018", "PGS003019", "PGS003020", "PGS003021", "PGS003022",
        "PGS003023", "PGS003024", "PGS003025", "PGS003026", "PGS003027",
        "PGS003028", "PGS004191", "PGS004192", "PGS004193", "PGS004194",
        "PGS004195", "PGS004234", "PGS004236", "PGS004455", "PGS004525",
        "PGS004785", "PGS004786", "PGS004787", "PGS004788", "PGS004934",
        "PGS005144", "PGS005153"
    ]
    
    orchestrator = GenomicOrchestrator(trait_name="hypertension", max_variants_per_batch=25000)
    orchestrator.run_pipeline(pgs_ids)

if __name__ == "__main__":
    main()