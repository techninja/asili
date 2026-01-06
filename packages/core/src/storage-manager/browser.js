/**
 * Browser storage manager using IndexedDB
 * Handles both genomic data and results with individual management
 */

import { StorageManager } from '../interfaces/genomic.js';
import { Debug } from '../utils/debug.js';

export class BrowserStorageManager extends StorageManager {
  constructor(config = {}) {
    super(config);
    this.dbName = config.dbName || 'asili-storage';
    this.version = config.version || 2;
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

        // Core storage
        if (!db.objectStoreNames.contains('data')) {
          db.createObjectStore('data', { keyPath: 'key' });
        }

        // Individual management
        if (!db.objectStoreNames.contains('individuals')) {
          db.createObjectStore('individuals', { keyPath: 'id' });
        }

        // DNA variants storage
        if (!db.objectStoreNames.contains('variants')) {
          const variantStore = db.createObjectStore('variants', {
            keyPath: ['rsid', 'individualId']
          });
          variantStore.createIndex('individualId', 'individualId', {
            unique: false
          });
          variantStore.createIndex('rsid', 'rsid', { unique: false });
        }

        // Risk scores cache
        if (!db.objectStoreNames.contains('risk_scores')) {
          db.createObjectStore('risk_scores', {
            keyPath: ['traitId', 'individualId']
          });
        }
      };
    });
  }

  async store(key, data) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');

      const entry = {
        key,
        data,
        timestamp: Date.now()
      };

      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async retrieve(key) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');

      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Individual management
  async addIndividual(id, name, relationship = 'self', emoji = '👤') {
    const db = await this._getDB();
    const individual = {
      id,
      name,
      relationship,
      emoji,
      status: 'importing',
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['individuals'], 'readwrite');
      const store = transaction.objectStore('individuals');

      const request = store.put(individual);
      request.onsuccess = () => resolve(individual);
      request.onerror = () => reject(request.error);
    });
  }

  async updateIndividual(id, updates) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['individuals'], 'readwrite');
      const store = transaction.objectStore('individuals');

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const individual = getRequest.result;
        if (!individual) {
          reject(new Error('Individual not found'));
          return;
        }

        const updated = { ...individual, ...updates };
        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getIndividuals() {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['individuals'], 'readonly');
      const store = transaction.objectStore('individuals');

      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // DNA variant storage
  async storeVariants(individualId, variants, progressCallback) {
    Debug.log(
      1,
      'BrowserStorageManager',
      `Storing ${variants.length} variants for individual: ${individualId}`
    );
    const db = await this._getDB();
    const batchSize = 5000;
    let processed = 0;

    for (let i = 0; i < variants.length; i += batchSize) {
      const batch = variants.slice(i, i + batchSize);

      await new Promise((resolve, reject) => {
        const transaction = db.transaction(['variants'], 'readwrite');
        const store = transaction.objectStore('variants');

        batch.forEach(variant => {
          store.put({ ...variant, individualId });
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          Debug.error(
            'BrowserStorageManager',
            `Failed to store batch at ${i}:`,
            transaction.error
          );
          reject(transaction.error);
        };
      });

      processed += batch.length;
      progressCallback?.(processed, variants.length);

      if (i % 25000 === 0) {
        Debug.log(
          3,
          'BrowserStorageManager',
          `Stored ${processed}/${variants.length} variants`
        );
      }
    }

    Debug.log(
      1,
      'BrowserStorageManager',
      `Successfully stored ${variants.length} variants for ${individualId}`
    );
    return variants.length;
  }

  // Get all variants for an individual in the format expected by DuckDB processor
  async getVariants(individualId) {
    Debug.log(
      2,
      'BrowserStorageManager',
      `Loading variants for individual: ${individualId}`
    );
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['variants'], 'readonly');
      const store = transaction.objectStore('variants');
      const index = store.index('individualId');

      const request = index.getAll(individualId);
      request.onsuccess = () => {
        // Convert to format expected by DuckDB processor
        const variants = request.result.map(variant => ({
          rsid: variant.rsid,
          chromosome: variant.chromosome,
          position: variant.position,
          allele1: variant.genotype ? variant.genotype[0] : variant.allele1,
          allele2: variant.genotype ? variant.genotype[1] : variant.allele2
        }));
        Debug.log(
          2,
          'BrowserStorageManager',
          `Loaded ${variants.length} variants for individual ${individualId}`
        );
        resolve(variants);
      };
      request.onerror = () => {
        Debug.error(
          'BrowserStorageManager',
          `Failed to load variants for ${individualId}:`,
          request.error
        );
        reject(request.error);
      };
    });
  }

  // Risk score caching
  async storeRiskScore(individualId, traitId, riskScore) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['risk_scores'], 'readwrite');
      const store = transaction.objectStore('risk_scores');

      const entry = {
        traitId,
        individualId,
        ...riskScore,
        calculatedAt: Date.now()
      };

      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedRiskScore(individualId, traitId) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['risk_scores'], 'readonly');
      const store = transaction.objectStore('risk_scores');

      const request = store.get([traitId, individualId]);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clear() {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');

      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async list() {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');

      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteIndividual(individualId, progressCallback) {
    const db = await this._getDB();

    return new Promise(async (resolve, reject) => {
      try {
        progressCallback?.('Counting items to delete...', 0);

        // Count total items first
        let totalVariants = 0;
        let totalRiskScores = 0;

        const countTransaction = db.transaction(
          ['variants', 'risk_scores'],
          'readonly'
        );

        // Count variants
        const variantIndex = countTransaction
          .objectStore('variants')
          .index('individualId');
        const variantCountRequest = variantIndex.count(individualId);
        variantCountRequest.onsuccess = () => {
          totalVariants = variantCountRequest.result;
        };

        // Count risk scores
        const riskStore = countTransaction.objectStore('risk_scores');
        const riskCountRequest = riskStore.openCursor();
        riskCountRequest.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.individualId === individualId) {
              totalRiskScores++;
            }
            cursor.continue();
          }
        };

        countTransaction.oncomplete = () => {
          const totalItems = totalVariants + totalRiskScores + 1; // +1 for individual record
          let deletedItems = 0;

          const deleteTransaction = db.transaction(
            ['variants', 'individuals', 'risk_scores'],
            'readwrite'
          );

          // Delete variants in batches
          const variantStore = deleteTransaction.objectStore('variants');
          const variantIndex = variantStore.index('individualId');
          const variantRequest = variantIndex.openCursor(individualId);

          let batchCount = 0;
          variantRequest.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
              cursor.delete();
              deletedItems++;
              batchCount++;

              if (batchCount % 10000 === 0) {
                const percent = Math.round((deletedItems / totalItems) * 100);
                progressCallback?.(
                  `${deletedItems}/${totalItems} ${percent}%`,
                  percent
                );
              }
              cursor.continue();
            }
          };

          // Delete individual
          deleteTransaction.objectStore('individuals').delete(individualId);
          deletedItems++;

          // Delete risk scores
          const riskStore = deleteTransaction.objectStore('risk_scores');
          const riskRequest = riskStore.openCursor();
          riskRequest.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor && cursor.value.individualId === individualId) {
              cursor.delete();
              deletedItems++;
            }
            if (cursor) cursor.continue();
          };

          deleteTransaction.oncomplete = () => {
            progressCallback?.(`${totalItems}/${totalItems} 100%`, 100);
            resolve();
          };
          deleteTransaction.onerror = () => reject(deleteTransaction.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async delete(key) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['data'], 'readwrite');
      const store = transaction.objectStore('data');

      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
