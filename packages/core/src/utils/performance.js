/**
 * Performance monitoring for genomic processing
 */

export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: null,
      variantsProcessed: 0,
      lastCheckpoint: null,
      checkpointVariants: 0,
      throughput: []
    };
  }

  start() {
    this.metrics.startTime = Date.now();
    this.metrics.lastCheckpoint = Date.now();
  }

  update(variantsProcessed) {
    const now = Date.now();
    const elapsed = (now - this.metrics.lastCheckpoint) / 1000;
    
    if (elapsed >= 1) { // Update every second
      const delta = variantsProcessed - this.metrics.checkpointVariants;
      const throughput = Math.round(delta / elapsed);
      
      this.metrics.throughput.push(throughput);
      if (this.metrics.throughput.length > 10) {
        this.metrics.throughput.shift();
      }
      
      this.metrics.variantsProcessed = variantsProcessed;
      this.metrics.checkpointVariants = variantsProcessed;
      this.metrics.lastCheckpoint = now;
      
      return throughput;
    }
    
    return null;
  }

  getAverageThroughput() {
    if (this.metrics.throughput.length === 0) return 0;
    return Math.round(
      this.metrics.throughput.reduce((a, b) => a + b, 0) / this.metrics.throughput.length
    );
  }

  getStats() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    const avgThroughput = this.getAverageThroughput();
    
    return {
      elapsed: Math.round(elapsed),
      variantsProcessed: this.metrics.variantsProcessed,
      avgThroughput,
      currentThroughput: this.metrics.throughput[this.metrics.throughput.length - 1] || 0
    };
  }
}
