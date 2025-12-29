/**
 * @typedef {Object} SNPRecord
 * @property {string} rsid
 * @property {string} chromosome
 * @property {number} position
 * @property {string} allele1
 * @property {string} allele2
 * @property {string} individualId
 */

/**
 * @typedef {Object} Individual
 * @property {string} id
 * @property {string} name
 * @property {string} relationship
 * @property {number} createdAt
 */

import { Debug } from '../lib/debug.js';

export class GeneticDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('AsiliDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('individual_metadata')) {
          db.createObjectStore('individual_metadata', { keyPath: 'individualId' });
        }
        
        if (!db.objectStoreNames.contains('individuals')) {
          db.createObjectStore('individuals', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('snps')) {
          const snpStore = db.createObjectStore('snps', { keyPath: ['rsid', 'individualId'] });
          snpStore.createIndex('individualId', 'individualId', { unique: false });
          snpStore.createIndex('rsid', 'rsid', { unique: false });
          snpStore.createIndex('position', ['chromosome', 'position', 'individualId'], { unique: false });
        }
        
        if (!db.objectStoreNames.contains('risk_cache')) {
          db.createObjectStore('risk_cache', { keyPath: ['traitFile', 'individualId'] });
        }
        
        if (!db.objectStoreNames.contains('pgs_details')) {
          db.createObjectStore('pgs_details', { keyPath: ['traitId', 'individualId'] });
        }
      };
    });
  }

  async getCount(individualId = null) {
    const transaction = this.db.transaction(['snps'], 'readonly');
    const store = transaction.objectStore('snps');
    
    if (!individualId) {
      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    const index = store.index('individualId');
    return new Promise((resolve, reject) => {
      const request = index.count(individualId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async hasData(individualId) {
    const transaction = this.db.transaction(['snps'], 'readonly');
    const store = transaction.objectStore('snps');
    const index = store.index('individualId');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(individualId);
      request.onsuccess = () => {
        resolve(!!request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearWithProgress(progressCallback) {
    const totalRecords = await this.getCount();
    const batchSize = 10000;
    let deleted = 0;

    while (deleted < totalRecords) {
      const transaction = this.db.transaction(['snps'], 'readwrite');
      const store = transaction.objectStore('snps');
      const keys = [];
      
      const keyRequest = store.openCursor();
      await new Promise((resolve) => {
        let collected = 0;
        keyRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && collected < batchSize) {
            keys.push(cursor.key);
            collected++;
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      if (keys.length > 0) {
        const deleteTransaction = this.db.transaction(['snps'], 'readwrite');
        const deleteStore = deleteTransaction.objectStore('snps');
        
        keys.forEach(key => deleteStore.delete(key));
        
        await new Promise((resolve, reject) => {
          deleteTransaction.oncomplete = () => resolve();
          deleteTransaction.onerror = () => reject(deleteTransaction.error);
        });
        
        deleted += keys.length;
        progressCallback?.(deleted, totalRecords);
      } else {
        break;
      }
    }
  }

  async importData(fileContents, individualId, progressCallback) {
    const lines = fileContents.split('\n');
    const dataLines = lines.filter(line => 
      line.trim() && !line.startsWith('#') && !line.startsWith('rsid')
    );
    
    const batchSize = 5000;
    let processed = 0;

    for (let i = 0; i < dataLines.length; i += batchSize) {
      const batch = dataLines.slice(i, i + batchSize);
      await this._processBatch(batch, individualId);
      processed += batch.length;
      progressCallback?.(processed, dataLines.length);
    }

    return dataLines.length;
  }

  async _processBatch(batch, individualId) {
    const transaction = this.db.transaction(['snps'], 'readwrite');
    const store = transaction.objectStore('snps');

    batch.forEach(line => {
      const columns = line.split('\t');
      if (columns.length >= 4) {
        const position = parseInt(columns[2], 10);
        if (!isNaN(position)) {
          const record = {
            rsid: columns[0].trim(),
            chromosome: columns[1].trim(),
            position,
            allele1: columns[3].trim(),
            allele2: columns[4]?.trim() || columns[3].trim(),
            individualId
          };
          store.put(record);
        }
      }
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async findByRsids(rsids, individualId) {
    const results = [];
    const BATCH_SIZE = 1000;
    
    for (let i = 0; i < rsids.length; i += BATCH_SIZE) {
      const batch = rsids.slice(i, i + BATCH_SIZE);
      
      // Create new transaction for each batch
      const transaction = this.db.transaction(['snps'], 'readonly');
      const store = transaction.objectStore('snps');
      
      const batchResults = await new Promise((resolve) => {
        const batchData = [];
        let completed = 0;
        
        batch.forEach(rsid => {
          const request = store.get([rsid, individualId]);
          request.onsuccess = () => {
            if (request.result) batchData.push(request.result);
            completed++;
            if (completed === batch.length) resolve(batchData);
          };
          request.onerror = () => {
            completed++;
            if (completed === batch.length) resolve(batchData);
          };
        });
      });
      
      results.push(...batchResults);
    }
    
    return results;
  }

  async findByPositions(positions, individualId) {
    const transaction = this.db.transaction(['snps'], 'readonly');
    const store = transaction.objectStore('snps');
    const results = [];
    const positionsSet = new Set(positions);
    
    return new Promise((resolve) => {
      const request = store.index('individualId').openCursor(individualId);
      let scanned = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          scanned++;
          const record = cursor.value;
          const key = `${record.chromosome}:${record.position}`;
          if (positionsSet.has(key)) {
            results.push(record);
          }
          cursor.continue();
        } else {
          Debug.log(2, 'GeneticDatabase', `Position lookup: found ${results.length} matches from ${positions.size} positions (scanned ${scanned})`);
          resolve(results);
        }
      };
      
      request.onerror = () => {
        Debug.error('GeneticDatabase', 'Error scanning positions:', request.error);
        resolve(results);
      };
    });
  }

  async addIndividual(id, name, relationship = 'self') {
    const individual = { id, name, relationship, createdAt: Date.now() };
    const transaction = this.db.transaction(['individuals'], 'readwrite');
    const store = transaction.objectStore('individuals');
    
    return new Promise((resolve, reject) => {
      const request = store.put(individual);
      request.onsuccess = () => resolve(individual);
      request.onerror = () => reject(request.error);
    });
  }

  async getIndividuals() {
    const transaction = this.db.transaction(['individuals'], 'readonly');
    const store = transaction.objectStore('individuals');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async setIndividualMetadata(individualId, variantCount, importedAt) {
    const metadata = { individualId, variantCount, importedAt };
    const transaction = this.db.transaction(['individual_metadata'], 'readwrite');
    const store = transaction.objectStore('individual_metadata');
    
    return new Promise((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve(metadata);
      request.onerror = () => reject(request.error);
    });
  }

  async getIndividualMetadata(individualId) {
    const transaction = this.db.transaction(['individual_metadata'], 'readonly');
    const store = transaction.objectStore('individual_metadata');
    
    return new Promise((resolve, reject) => {
      const request = store.get(individualId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async waitForIdle() {
    return new Promise((resolve) => {
      // Wait for any pending transactions to complete
      if (this.db.transaction) {
        setTimeout(() => this.waitForIdle().then(resolve), 10);
      } else {
        resolve();
      }
    });
  }

  async getAllCachedRisks(traitIds, individualId) {
    console.log(`[${new Date().toISOString()}] getAllCachedRisks start:`, traitIds.length, 'traits');
    const transaction = this.db.transaction(['risk_cache'], 'readonly');
    const store = transaction.objectStore('risk_cache');
    
    const promises = traitIds.map(traitId => 
      new Promise((resolve) => {
        const request = store.get([traitId, individualId]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      })
    );
    
    const results = await Promise.all(promises);
    console.log(`[${new Date().toISOString()}] getAllCachedRisks end:`, results.length, 'results');
    return results;
  }

  async getCachedRisk(traitId, individualId) {
    const transaction = this.db.transaction(['risk_cache'], 'readonly');
    const store = transaction.objectStore('risk_cache');
    
    return new Promise((resolve, reject) => {
      const request = store.get([traitId, individualId]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async setCachedPGSDetails(traitId, individualId, pgsDetails) {
    // Pre-compute bin data for ALL contributing variants + store top 20 detailed variants
    const optimizedDetails = {};
    Object.entries(pgsDetails).forEach(([pgsId, data]) => {
      const contributingVariants = data.variants.filter(v => v.userGenotype); // All matched variants, not just positive weights
      
      // Create bins for all contributing variants (separate positive/negative)
      const bins = [
        { label: '-1.0+', min: -Infinity, max: -1.0, count: 0, sum: 0 },
        { label: '-0.1 to -1.0', min: -1.0, max: -0.1, count: 0, sum: 0 },
        { label: '-0.05 to -0.1', min: -0.1, max: -0.05, count: 0, sum: 0 },
        { label: '-0.01 to -0.05', min: -0.05, max: -0.01, count: 0, sum: 0 },
        { label: '-0.001 to -0.01', min: -0.01, max: -0.001, count: 0, sum: 0 },
        { label: '-0.0001 to -0.001', min: -0.001, max: -0.0001, count: 0, sum: 0 },
        { label: '0.0001-0.001', min: 0.0001, max: 0.001, count: 0, sum: 0 },
        { label: '0.001-0.01', min: 0.001, max: 0.01, count: 0, sum: 0 },
        { label: '0.01-0.05', min: 0.01, max: 0.05, count: 0, sum: 0 },
        { label: '0.05-0.1', min: 0.05, max: 0.1, count: 0, sum: 0 },
        { label: '0.1-1.0', min: 0.1, max: 1.0, count: 0, sum: 0 },
        { label: '1.0+', min: 1.0, max: Infinity, count: 0, sum: 0 }
      ];
      
      contributingVariants.forEach(v => {
        const weight = v.effect_weight;
        const bin = bins.find(b => weight >= b.min && weight < b.max);
        if (bin) {
          bin.count++;
          bin.sum += v.effect_weight;
        }
      });
      
      // Sort contributing variants by effect weight and keep top 20 with all details
      const topVariants = contributingVariants
        .filter(v => v.userGenotype) // Only show variants with DNA matches
        .sort((a, b) => Math.abs(b.effect_weight) - Math.abs(a.effect_weight))
        .slice(0, 20)
        .map(v => ({
          rsid: v.rsid,
          effect_allele: v.effect_allele,
          effect_weight: v.effect_weight,
          userGenotype: v.userGenotype
        }));
      
      optimizedDetails[pgsId] = {
        metadata: data.metadata,
        bins: bins, // Pre-computed bin data for all variants
        totalVariants: contributingVariants.length,
        topVariants: topVariants
      };
    });
    
    const entry = { traitId, individualId, pgsDetails: optimizedDetails, cachedAt: Date.now() };
    const transaction = this.db.transaction(['pgs_details'], 'readwrite');
    const store = transaction.objectStore('pgs_details');
    
    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve(entry);
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedPGSDetails(traitId, individualId) {
    const transaction = this.db.transaction(['pgs_details'], 'readonly');
    const store = transaction.objectStore('pgs_details');
    
    return new Promise((resolve, reject) => {
      const request = store.get([traitId, individualId]);
      request.onsuccess = () => resolve(request.result?.pgsDetails);
      request.onerror = () => reject(request.error);
    });
  }

  async setCachedRisk(traitId, individualId, riskData) {
    const cacheEntry = {
      traitFile: traitId, // Keep old field name for compatibility
      individualId,
      ...riskData,
      calculatedAt: Date.now()
    };
    
    const transaction = this.db.transaction(['risk_cache'], 'readwrite');
    const store = transaction.objectStore('risk_cache');
    
    return new Promise((resolve, reject) => {
      const request = store.put(cacheEntry);
      request.onsuccess = () => resolve(cacheEntry);
      request.onerror = () => reject(request.error);
    });
  }
}