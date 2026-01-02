#!/bin/bash
# Minimal CUDA setup for Ubuntu + 3x GTX 1080 Ti

set -e  # Exit on error

echo "🚀 Setting up CUDA for genomic processing..."

# Check NVIDIA drivers
if ! nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA drivers not found"
    echo "Install with: sudo apt install nvidia-driver-535"
    exit 1
fi

echo "✅ NVIDIA drivers detected"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Install Python3 and venv if missing
if ! command -v python3 &> /dev/null; then
    echo "📦 Installing Python3..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# Install CUDA runtime libraries for CuPy
echo "📦 Installing CUDA runtime libraries..."
sudo apt update
sudo apt install -y cuda-nvrtc-11-8 cuda-cudart-11-8

# Add to library path
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH

# Create virtual environment
if [ ! -d "cuda-env" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv cuda-env --upgrade-deps
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source cuda-env/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install CUDA packages (CuPy only - cuDF not supported on GTX 1070 Ti)
echo "📦 Installing CuPy (cuDF not supported on Compute 6.1)..."
pip install cupy-cuda11x

echo "✅ Setup complete!"
echo ""
echo "🧪 Test with:"
echo "   source cuda-env/bin/activate"
echo "   python3 test_cupy_numeric.py"