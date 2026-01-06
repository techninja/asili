// Core interfaces
export * from './interfaces/index.js';

// Progress tracking
export * from './progress/index.js';

// Queue management
export * from './queue/index.js';

// Utilities
export { Debug } from './utils/debug.js';

// Browser implementations
export { BrowserGenomicProcessor } from './genomic-processor/browser.js';
export { BrowserStorageManager } from './storage-manager/browser.js';
export { BasicRiskCalculator } from './risk-calculator/basic.js';

// Factory function for browser environment
export async function createBrowserProcessor(config = {}) {
  const { ProgressTracker } = await import('./progress/index.js');
  const { BrowserGenomicProcessor } =
    await import('./genomic-processor/browser.js');

  const progressTracker = new ProgressTracker();
  const processor = new BrowserGenomicProcessor(config, progressTracker);

  return { processor, progressTracker };
}

// Factory function for storage manager
export async function createBrowserStorage(config = {}) {
  const { BrowserStorageManager } =
    await import('./storage-manager/browser.js');
  return new BrowserStorageManager(config);
}

// Factory function for risk calculator
export async function createRiskCalculator(config = {}) {
  const { BasicRiskCalculator } = await import('./risk-calculator/basic.js');
  return new BasicRiskCalculator(config);
}

// Environment detection utilities
function isBrowser() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function isNode() {
  return (
    typeof process !== 'undefined' && process.versions && process.versions.node
  );
}

// Auto-detecting factory functions
export async function createProcessor(config = {}) {
  if (isBrowser()) {
    return createBrowserProcessor(config);
  } else if (isNode()) {
    // TODO: Implement Node.js processor
    throw new Error('Node.js processor not yet implemented');
  } else {
    throw new Error('Unsupported environment');
  }
}

export async function createStorage(config = {}) {
  if (isBrowser()) {
    return createBrowserStorage(config);
  } else if (isNode()) {
    // TODO: Implement Node.js storage (filesystem-based)
    throw new Error('Node.js storage not yet implemented');
  } else {
    throw new Error('Unsupported environment');
  }
}
