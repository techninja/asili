/**
 * Manages trait metadata caching in IndexedDB
 * Syncs with streamed trait_manifest.db data
 */

import { Debug } from '@asili/debug';

export class TraitCacheManager {
  constructor() {
    this.dbName = 'asili-trait-cache';
    this.version = 1;
    this.db = null;
  }

  async _getDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('traits')) {
          const store = db.createObjectStore('traits', { keyPath: 'id' });
          store.createIndex('categories', 'categories', { unique: false, multiEntry: true });
        }
        if (!db.objectStoreNames.contains('risk_results')) {
          const riskStore = db.createObjectStore('risk_results', { keyPath: ['traitId', 'individualId'] });
          riskStore.createIndex('individualId', 'individualId', { unique: false });
        }
      };
    });
  }

  async cacheTraits(traits) {
    Debug.log(1, 'TraitCacheManager', `Caching ${traits.length} traits to IndexedDB`);
    const db = await this._getDB();
    const transaction = db.transaction(['traits'], 'readwrite');
    const store = transaction.objectStore('traits');

    for (const trait of traits) {
      store.put(trait);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        Debug.log(2, 'TraitCacheManager', `Successfully cached ${traits.length} traits`);
        resolve();
      };
      transaction.onerror = () => {
        Debug.error('TraitCacheManager', 'Cache error:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getTraits(offset = 0, limit = 50) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['traits'], 'readonly');
      const store = transaction.objectStore('traits');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result;
        resolve(all.slice(offset, offset + limit));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTraitCount() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['traits'], 'readonly');
      const store = transaction.objectStore('traits');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTraits() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['traits'], 'readonly');
      const store = transaction.objectStore('traits');
      const request = store.getAll();

      request.onsuccess = () => {
        Debug.log(2, 'TraitCacheManager', `Retrieved ${request.result.length} traits from cache`);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cacheRiskResults(individualId, results) {
    Debug.log(1, 'TraitCacheManager', `Caching ${results.length} risk results for ${individualId}`);
    const db = await this._getDB();
    const transaction = db.transaction(['risk_results'], 'readwrite');
    const store = transaction.objectStore('risk_results');

    for (const result of results) {
      store.put({ ...result, traitId: result.trait_id, individualId });
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        Debug.log(2, 'TraitCacheManager', `Cached ${results.length} risk results`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getRiskResults(individualId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['risk_results'], 'readonly');
      const store = transaction.objectStore('risk_results');
      const index = store.index('individualId');
      const request = index.getAll(individualId);

      request.onsuccess = () => {
        Debug.log(2, 'TraitCacheManager', `Retrieved ${request.result.length} risk results from cache`);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear() {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['traits'], 'readwrite');
      const store = transaction.objectStore('traits');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
