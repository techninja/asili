// Core interfaces
export * from './interfaces/index.js';

// Progress tracking
export * from './progress/index.js';

// Queue management
export * from './queue/index.js';

// Cache management (disabled for now)
// export { DuckDBCacheManager } from './cache/duckdb-manager.js';

// Utilities
export { Debug } from './utils/debug.js';

// Browser implementations
export { BrowserGenomicProcessor } from './genomic-processor/browser.js';
export { BrowserStorageManager } from './storage-manager/browser.js';
export { BasicRiskCalculator } from './risk-calculator/basic.js';

// Server implementations (commented out to avoid Node.js imports in browser)
// export { ServerGenomicProcessor } from './genomic-processor/server.js';
// export { ServerStorageManager } from './storage-manager/server.js';

// Browser-specific unified processor (no Node.js imports)
export { 
  UnifiedProcessor as BrowserUnifiedProcessor, 
  createBrowserProcessor 
} from './unified-processor-browser.js';

// Full unified processor (with Node.js imports for server)
export { 
  UnifiedProcessor, 
  createServerProcessor, 
  createProcessor 
} from './unified-processor.js';
