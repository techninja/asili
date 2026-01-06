export class TimeEstimator {
  constructor() {
    this.history = new Map(); // traitId -> { times: [], avgTime: number }
    this.baseEstimate = 30000; // 30 seconds default
  }

  recordCompletion(traitId, duration, variantCount) {
    if (!this.history.has(traitId)) {
      this.history.set(traitId, { times: [], avgTime: this.baseEstimate });
    }

    const record = this.history.get(traitId);
    record.times.push({ duration, variantCount, timestamp: Date.now() });

    // Keep only last 10 records
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
    if (!record) {
      // Estimate based on variant count: ~1ms per 1000 variants
      return Math.max(this.baseEstimate, variantCount);
    }

    // Adjust for variant count if significantly different
    if (variantCount > 0 && record.times.length > 0) {
      const avgVariants =
        record.times.reduce((sum, t) => sum + t.variantCount, 0) /
        record.times.length;
      const ratio = variantCount / Math.max(avgVariants, 1000);
      return Math.round(record.avgTime * ratio);
    }

    return record.avgTime;
  }

  estimateQueueTime(queue) {
    return queue.reduce((total, item) => {
      if (item.status === 'pending') {
        return total + this.estimateTime(item.traitId, item.variantCount);
      }
      return total;
    }, 0);
  }
}
