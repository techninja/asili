# Makefile for CUDA PGS Calculator

NVCC = nvcc
CFLAGS = -O3 -arch=sm_75 -Xcompiler -fPIC
TARGET = libpgs.so

all: $(TARGET)

$(TARGET): pgs_kernel.cu
	$(NVCC) $(CFLAGS) -shared -o $@ $<

clean:
	rm -f $(TARGET)

test: $(TARGET)
	python3 cuda_pgs.py ../../data_out/1000genomes/chr22 test_weights.txt

.PHONY: all clean test
