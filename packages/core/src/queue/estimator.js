export class TimeEstimator {
  constructor() {
    this.history = new Map(); // traitId -> { times: [], avgTime: number }
    this.baseEstimate = 15000; // 15 seconds default (more realistic)
    this.variantsPerSecond = 25000; // Default: 25k rows/second (based on actual data)
    this.performanceHistory = []; // Track actual performance
  }

  recordCompletion(traitId, duration, variantCount, totalRows = null) {
    if (!this.history.has(traitId)) {
      this.history.set(traitId, { times: [], avgTime: this.baseEstimate });
    }

    const record = this.history.get(traitId);
    record.times.push({ duration, variantCount, totalRows, timestamp: Date.now() });

    // Update global performance metrics using total rows processed (more accurate)
    const processingMetric = totalRows || variantCount;
    if (processingMetric > 0) {
      const actualRate = processingMetric / (duration / 1000);
      this.performanceHistory.push(actualRate);
      
      // Keep only last 20 measurements
      if (this.performanceHistory.length > 20) {
        this.performanceHistory.shift();
      }
      
      // Update processing rate with weighted average (recent measurements weighted more)
      this.variantsPerSecond = this.performanceHistory.reduce((sum, rate, i) => {
        const weight = i + 1;
        return sum + rate * weight;
      }, 0) / this.performanceHistory.reduce((sum, _, i) => sum + i + 1, 0);
    }

    // Keep only last 10 records per trait
    if (record.times.length > 10) {
      record.times.shift();
    }

    // Calculate weighted average (recent times weighted more)
    const weights = record.times.map((_, i) => i + 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    record.avgTime =
      record.times.reduce(
        (sum, time, i) => sum + time.duration * weights[i],
        0
      ) / totalWeight;
  }

  estimateTime(traitId, variantCount = 0) {
    const record = this.history.get(traitId);
    
    // Estimate based on variant count but use more realistic baseline
    if (variantCount > 0) {
      // Use current performance rate (rows/second) with variant count as proxy
      const estimatedMs = (variantCount / this.variantsPerSecond) * 1000;
      const baseTime = Math.max(15000, estimatedMs); // 15 second minimum
      
      // If we have historical data for this trait, blend with it
      if (record && record.times.length > 0) {
        const historicalTime = record.avgTime;
        return Math.round(baseTime * 0.6 + historicalTime * 0.4);
      }
      
      return Math.round(baseTime);
    }
    
    return record ? record.avgTime : this.baseEstimate;
  }

  estimateQueueTime(queue) {
    return queue.reduce((total, item) => {
      if (item.status === 'pending') {
        const variantCount = item.trait?.variant_count || 0;
        return total + this.estimateTime(item.traitId, variantCount);
      }
      return total;
    }, 0);
  }
  
  getCurrentPerformance() {
    return {
      variantsPerSecond: Math.round(this.variantsPerSecond),
      measurementCount: this.performanceHistory.length
    };
  }
}
