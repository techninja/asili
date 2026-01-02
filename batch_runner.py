#!/usr/bin/env python3
"""
Process-based batch runner to prevent memory leaks
Each batch runs in isolated subprocess that gets cleaned up
"""

import subprocess
import json
import sys
import os
import time

def run_single_batch(batch_data, batch_num, output_file):
    """Run a single batch in subprocess"""
    # Write batch data to temp file
    batch_file = f'temp_batch_{batch_num}.json'
    with open(batch_file, 'w') as f:
        json.dump(batch_data, f)
    
    # Run GPU pipeline as subprocess
    cmd = [sys.executable, 'gpu_pipeline.py', batch_file, output_file]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        os.unlink(batch_file)  # Cleanup temp file
        
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr
    except subprocess.TimeoutExpired:
        os.unlink(batch_file)
        return False, "Batch timeout (10 minutes)"
    except Exception as e:
        if os.path.exists(batch_file):
            os.unlink(batch_file)
        return False, str(e)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python batch_runner.py <batch_data.json> <batch_num> <output.parquet>")
        sys.exit(1)
    
    batch_file = sys.argv[1]
    batch_num = int(sys.argv[2])
    output_file = sys.argv[3]
    
    with open(batch_file) as f:
        batch_data = json.load(f)
    
    print(f"🚀 Running batch {batch_num} in isolated process...")
    start_time = time.time()
    
    success, output = run_single_batch(batch_data, batch_num, output_file)
    
    if success:
        print(f"✅ Batch {batch_num} completed in {time.time() - start_time:.1f}s")
        print(output)
    else:
        print(f"❌ Batch {batch_num} failed: {output}")
        sys.exit(1)