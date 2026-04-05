/**
 * Data layer interface — universal API contract.
 * Components import the data layer and call methods without knowing
 * which adapter (browser/hybrid) is active.
 * @module packages/core/src/data-layer/interface
 */

/**
 * @typedef {object} Individual
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} relationship
 * @property {string} familyName
 * @property {number} variantCount
 * @property {string} status - 'importing' | 'ready' | 'scoring'
 * @property {boolean} hasImputed
 */

/**
 * @typedef {object} DataLayer
 * @property {() => Promise<void>} initialize
 * @property {() => Promise<{tier: number, mode: string}>} getStatus
 *
 * @property {() => Promise<Individual[]>} getIndividuals
 * @property {(id: string) => Promise<Individual|null>} getIndividual
 * @property {(data: Partial<Individual>) => Promise<Individual>} addIndividual
 * @property {(id: string, updates: object) => Promise<Individual>} updateIndividual
 * @property {(id: string) => Promise<void>} deleteIndividual
 *
 * @property {(id: string, traitId: string) => Promise<object|null>} getRiskScore
 * @property {(id: string) => Promise<object[]>} getAllResults
 * @property {(id: string, traitId: string, result: object) => Promise<void>} saveRiskScore
 * @property {(id: string) => Promise<void>} clearResults
 *
 * @property {() => Promise<object>} getTraitManifest
 *
 * @property {(id: string, variants: Array, meta: object) => Promise<void>} storeVariants
 * @property {(id: string) => Promise<object|null>} getVariants
 * @property {(id: string) => Promise<void>} deleteVariants
 */

/**
 * Validate that an object implements the DataLayer interface.
 * @param {object} adapter
 * @returns {boolean}
 */
export function validateAdapter(adapter) {
  const required = [
    'initialize', 'getStatus',
    'getIndividuals', 'getIndividual', 'addIndividual',
    'updateIndividual', 'deleteIndividual',
    'getRiskScore', 'getAllResults', 'saveRiskScore', 'clearResults',
    'getTraitManifest',
    'storeVariants', 'getVariants', 'deleteVariants',
  ];
  return required.every(m => typeof adapter[m] === 'function');
}
