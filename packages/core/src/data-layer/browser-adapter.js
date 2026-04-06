/**
 * Browser data layer adapter.
 * IndexedDB for storage, fetches manifest from CDN.
 * DuckDB WASM scoring is handled by the scoring worker (Phase 6).
 * @module packages/core/src/data-layer/browser-adapter
 */

import * as idb from './idb.js';

/** @type {object|null} */
let manifest = null;

/** @param {string} [manifestUrl] */
export function createBrowserAdapter(manifestUrl = '/data/trait_manifest.json') {
  return {
    async initialize() {
      await idb.openDB();
      try {
        const res = await fetch(manifestUrl);
        if (res.ok) manifest = await res.json();
      } catch { /* manifest loaded lazily if fetch fails */ }
    },

    async getStatus() {
      return { tier: 1, mode: 'browser', manifestLoaded: !!manifest };
    },

    async getIndividuals() { return idb.getAll('individuals'); },

    async getIndividual(id) { return idb.get('individuals', id); },

    async addIndividual(data) {
      const individual = {
        id: data.id || `${Date.now()}_${data.name || 'unknown'}`,
        name: data.name || '', emoji: data.emoji || '👤',
        relationship: data.relationship || 'self',
        familyName: data.familyName || '',
        variantCount: data.variantCount || 0,
        status: data.status || 'importing',
        hasImputed: false,
      };
      await idb.put('individuals', individual.id, individual);
      return individual;
    },

    async updateIndividual(id, updates) {
      const existing = await idb.get('individuals', id);
      if (!existing) throw new Error(`Individual ${id} not found`);
      const updated = { ...existing, ...updates };
      await idb.put('individuals', id, updated);
      return updated;
    },

    async deleteIndividual(id) {
      await idb.del('individuals', id);
      await idb.del('variants', id);
      const keys = await idb.getAllKeys('results');
      for (const k of keys) {
        if (String(k).startsWith(`${id}:`)) await idb.del('results', k);
      }
    },

    async getRiskScore(individualId, traitId) {
      return idb.get('results', `${individualId}:${traitId}`);
    },

    async getAllResults(individualId) {
      const keys = await idb.getAllKeys('results');
      const prefix = `${individualId}:`;
      const out = [];
      for (const k of keys) {
        if (String(k).startsWith(prefix)) {
          const r = await idb.get('results', k);
          const traitId = String(k).slice(prefix.length);
          if (r) out.push({ ...r, traitId });
        }
      }
      return out;
    },

    async saveRiskScore(individualId, traitId, result) {
      await idb.put('results', `${individualId}:${traitId}`, {
        ...result, calculatedAt: new Date().toISOString(),
      });
    },

    async clearResults(individualId) {
      const keys = await idb.getAllKeys('results');
      for (const k of keys) {
        if (String(k).startsWith(`${individualId}:`)) await idb.del('results', k);
      }
    },

    async getTraitManifest() {
      if (!manifest) {
        const res = await fetch(manifestUrl);
        manifest = await res.json();
      }
      return manifest;
    },

    async storeVariants(individualId, variants, meta = {}) {
      await idb.put('variants', individualId, { variants, metadata: meta });
    },

    async getVariants(individualId) {
      return idb.get('variants', individualId);
    },

    async deleteVariants(individualId) {
      await idb.del('variants', individualId);
    },
  };
}
