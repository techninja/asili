// pgs_kernel.cu - Minimal CUDA PGS Calculator
#include <cuda_runtime.h>
#include <stdio.h>

// Kernel: Calculate PGS for all samples in parallel
__global__ void calculatePGS(
    const char* genotypes,      // 2D: [n_samples x n_variants], values: 0,1,2
    const float* weights,       // 1D: [n_variants]
    float* scores,              // Output: [n_samples]
    int n_samples,
    int n_variants
) {
    int sample_idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (sample_idx >= n_samples) return;
    
    float score = 0.0f;
    for (int v = 0; v < n_variants; v++) {
        score += genotypes[sample_idx * n_variants + v] * weights[v];
    }
    scores[sample_idx] = score;
}

extern "C" {
    void cuda_calculate_pgs(
        const char* h_genotypes, const float* h_weights, float* h_scores,
        int n_samples, int n_variants
    ) {
        char* d_genotypes; float* d_weights; float* d_scores;
        
        cudaMalloc(&d_genotypes, n_samples * n_variants);
        cudaMalloc(&d_weights, n_variants * sizeof(float));
        cudaMalloc(&d_scores, n_samples * sizeof(float));
        
        cudaMemcpy(d_genotypes, h_genotypes, n_samples * n_variants, cudaMemcpyHostToDevice);
        cudaMemcpy(d_weights, h_weights, n_variants * sizeof(float), cudaMemcpyHostToDevice);
        
        calculatePGS<<<(n_samples + 255) / 256, 256>>>(d_genotypes, d_weights, d_scores, n_samples, n_variants);
        
        cudaMemcpy(h_scores, d_scores, n_samples * sizeof(float), cudaMemcpyDeviceToHost);
        
        cudaFree(d_genotypes); cudaFree(d_weights); cudaFree(d_scores);
    }
}
