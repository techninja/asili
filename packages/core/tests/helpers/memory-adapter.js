/**
 * In-memory adapter for testing — mirrors browser-adapter logic without IndexedDB.
 * @module packages/core/tests/helpers/memory-adapter
 */

/**
 *
 */
export function createMemoryAdapter() {
  const stores = { individuals: new Map(), variants: new Map(), results: new Map() };

  return {
    _stores: stores,
    async initialize() {},
    async getStatus() { return { tier: 1, mode: 'browser' }; },

    async getIndividuals() { return [...stores.individuals.values()]; },
    async getIndividual(id) { return stores.individuals.get(id) ?? null; },
    async addIndividual(data) {
      const individual = {
        id: data.id || `${Date.now()}_${data.name || 'unknown'}`,
        name: data.name || '', emoji: data.emoji || '👤',
        relationship: data.relationship || 'self',
        familyName: data.familyName || '',
        variantCount: data.variantCount || 0,
        status: data.status || 'importing', hasImputed: false,
      };
      stores.individuals.set(individual.id, individual);
      return individual;
    },
    async updateIndividual(id, updates) {
      const existing = stores.individuals.get(id);
      if (!existing) throw new Error(`Individual ${id} not found`);
      const updated = { ...existing, ...updates };
      stores.individuals.set(id, updated);
      return updated;
    },
    async deleteIndividual(id) {
      stores.individuals.delete(id);
      stores.variants.delete(id);
      for (const k of stores.results.keys()) {
        if (k.startsWith(`${id}:`)) stores.results.delete(k);
      }
    },

    async getRiskScore(iid, tid) {
      return stores.results.get(`${iid}:${tid}`) ?? null;
    },
    async getAllResults(iid) {
      const prefix = `${iid}:`;
      return [...stores.results.entries()]
        .filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    },
    async saveRiskScore(iid, tid, result) {
      stores.results.set(`${iid}:${tid}`, result);
    },
    async clearResults(iid) {
      for (const k of stores.results.keys()) {
        if (k.startsWith(`${iid}:`)) stores.results.delete(k);
      }
    },

    async getTraitManifest() { return { traits: {} }; },
    async storeVariants(id, variants, meta = {}) {
      stores.variants.set(id, { variants, metadata: meta });
    },
    async getVariants(id) { return stores.variants.get(id) ?? null; },
    async deleteVariants(id) { stores.variants.delete(id); },
  };
}
