/**
 * Memory monitoring utility for tracking and managing memory usage
 */
export class MemoryMonitor {
    static getMemoryInfo() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }
        return null;
    }

    static logMemoryUsage(context = '') {
        const info = this.getMemoryInfo();
        if (info) {
            console.log(`[Memory ${context}] Used: ${info.used}MB, Total: ${info.total}MB, Limit: ${info.limit}MB`);
        }
    }

    static checkMemoryAvailable(requiredMB = 100) {
        const info = this.getMemoryInfo();
        if (!info) return true; // Can't check, assume OK
        
        const available = info.limit - info.used;
        return available >= requiredMB;
    }

    static async forceGarbageCollection() {
        if (window.gc) {
            window.gc();
        }
        
        // Create and release temporary objects to encourage GC
        const temp = new Array(1000).fill(null).map(() => ({ data: new Array(100) }));
        temp.length = 0;
        
        // Yield to allow GC to run
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    static getMemoryPressureLevel() {
        const info = this.getMemoryInfo();
        if (!info) return 'unknown';
        
        const usagePercent = (info.used / info.limit) * 100;
        
        if (usagePercent > 90) return 'critical';
        if (usagePercent > 75) return 'high';
        if (usagePercent > 50) return 'medium';
        return 'low';
    }

    static createMemoryWarning(level) {
        const messages = {
            critical: 'Memory usage is critical. Please refresh the page.',
            high: 'Memory usage is high. Consider refreshing the page if you experience issues.',
            medium: 'Memory usage is moderate. Processing may be slower.'
        };
        
        return messages[level] || '';
    }
}