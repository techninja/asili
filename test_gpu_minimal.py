#!/usr/bin/env python3
"""Ultra-minimal GPU test"""

try:
    import cupy as cp
    print(f"✅ CuPy available: {cp.cuda.runtime.getDeviceCount()} GPUs")
    for i in range(cp.cuda.runtime.getDeviceCount()):
        cp.cuda.Device(i).use()
        print(f"   GPU {i}: {cp.cuda.runtime.getDeviceProperties(i)['name'].decode()}")
except ImportError:
    print("❌ CuPy not installed. Run: pip install cupy-cuda11x")
except Exception as e:
    print(f"❌ CUDA error: {e}")

try:
    import cudf
    print("✅ cuDF available")
except ImportError:
    print("❌ cuDF not installed. Run: pip install cudf-cu11 --extra-index-url=https://pypi.nvidia.com")