/**
 * Data layer — universal adapter for storage and scoring.
 * @module packages/core/src/data-layer
 */

export { validateAdapter } from './interface.js';
export { createBrowserAdapter } from './browser-adapter.js';
export { createDataLayer, getDataLayer, resetDataLayer } from './create.js';
