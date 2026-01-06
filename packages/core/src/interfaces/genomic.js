/**
 * Core interfaces for genomic processing
 * Platform-agnostic definitions for browser, mobile, and server
 */

/**
 * @typedef {Object} DNAData
 * @property {string} format - DNA file format (23andme, ancestrydna, etc.)
 * @property {Array<Object>} variants - Array of genetic variants
 * @property {Object} metadata - File metadata and processing info
 */

/**
 * @typedef {Object} TraitConfig
 * @property {string} id - Trait identifier
 * @property {string} name - Human-readable trait name
 * @property {string} category - Trait category
 * @property {Array<string>} pgsIds - Associated PGS identifiers
 */

/**
 * @typedef {Object} RiskScore
 * @property {string} traitId - Trait identifier
 * @property {number} score - Calculated polygenic risk score
 * @property {number} percentile - Population percentile
 * @property {string} interpretation - Risk interpretation
 * @property {Object} metadata - Calculation metadata
 */

/**
 * @typedef {Object} Dataset
 * @property {string} id - Dataset identifier
 * @property {string} type - Dataset type (pgs, reference, etc.)
 * @property {Object} schema - Data schema definition
 * @property {Object} metadata - Dataset metadata
 */

/**
 * @typedef {Object} DataSource
 * @property {string} type - Source type (url, file, buffer)
 * @property {string|File|ArrayBuffer} source - Data source
 * @property {Object} options - Source-specific options
 */

/**
 * Genomic processor interface
 */
export class GenomicProcessor {
  /**
   * @param {Object} config - Processor configuration
   * @param {ProgressTracker} progressTracker - Progress tracking instance
   */
  constructor(config, progressTracker) {
    this.config = config;
    this.progress = progressTracker;
  }

  /**
   * Load genomic dataset
   * @param {DataSource} source - Data source configuration
   * @returns {Promise<Dataset>} Loaded dataset
   */
  async loadDataset(source) {
    throw new Error('loadDataset must be implemented');
  }

  /**
   * Calculate polygenic risk scores
   * @param {DNAData} dna - DNA data
   * @param {Array<TraitConfig>} traits - Traits to calculate
   * @returns {Promise<Array<RiskScore>>} Risk scores
   */
  async calculatePGS(dna, traits) {
    throw new Error('calculatePGS must be implemented');
  }

  /**
   * Cache processing results
   * @param {Array<RiskScore>} results - Results to cache
   * @returns {Promise<void>}
   */
  async cacheResults(results) {
    throw new Error('cacheResults must be implemented');
  }
}

/**
 * Storage manager interface
 */
export class StorageManager {
  /**
   * @param {Object} config - Storage configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Store data
   * @param {string} key - Storage key
   * @param {any} data - Data to store
   * @returns {Promise<void>}
   */
  async store(key, data) {
    throw new Error('store must be implemented');
  }

  /**
   * Retrieve data
   * @param {string} key - Storage key
   * @returns {Promise<any>} Retrieved data
   */
  async retrieve(key) {
    throw new Error('retrieve must be implemented');
  }

  /**
   * Clear storage
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('clear must be implemented');
  }

  /**
   * List stored keys
   * @returns {Promise<Array<string>>} Array of keys
   */
  async list() {
    throw new Error('list must be implemented');
  }
}

/**
 * Risk calculator interface
 */
export class RiskCalculator {
  /**
   * @param {Object} config - Calculator configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Calculate risk score for a trait
   * @param {DNAData} dna - DNA data
   * @param {TraitConfig} trait - Trait configuration
   * @param {Dataset} pgsData - PGS dataset
   * @returns {Promise<RiskScore>} Calculated risk score
   */
  async calculateRisk(dna, trait, pgsData) {
    throw new Error('calculateRisk must be implemented');
  }

  /**
   * Batch calculate multiple traits
   * @param {DNAData} dna - DNA data
   * @param {Array<TraitConfig>} traits - Traits to calculate
   * @param {Map<string, Dataset>} pgsDatasets - PGS datasets by trait ID
   * @returns {Promise<Array<RiskScore>>} Risk scores
   */
  async batchCalculate(dna, traits, pgsDatasets) {
    const results = [];
    for (const trait of traits) {
      const pgsData = pgsDatasets.get(trait.id);
      if (pgsData) {
        const score = await this.calculateRisk(dna, trait, pgsData);
        results.push(score);
      }
    }
    return results;
  }
}
