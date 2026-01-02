#!/bin/bash
# Minimal CUDA setup for Ubuntu + 3x GTX 1080 Ti

echo "🚀 Setting up CUDA for genomic processing..."

# Check NVIDIA drivers
if ! nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA drivers not found"
    echo "Install with: sudo apt install nvidia-driver-535"
    exit 1
fi

echo "✅ NVIDIA drivers detected"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Install CUDA toolkit if needed
if ! nvcc --version &> /dev/null; then
    echo "📦 Installing CUDA toolkit..."
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
    sudo dpkg -i cuda-keyring_1.0-1_all.deb
    sudo apt-get update
    sudo apt-get -y install cuda-toolkit-11-8
    echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
    export PATH=/usr/local/cuda/bin:$PATH
fi

# Install Python packages
echo "📦 Installing Python CUDA packages..."
pip3 install cupy-cuda11x cudf-cu11 --extra-index-url=https://pypi.nvidia.com

echo "✅ Setup complete!"
echo ""
echo "🧪 Test with: python3 test_cuda_simple.py"