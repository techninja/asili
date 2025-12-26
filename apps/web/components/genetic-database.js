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
        }
        
        if (!db.objectStoreNames.contains('risk_cache')) {
          db.createObjectStore('risk_cache', { keyPath: ['traitFile', 'individualId'] });
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
    const transaction = this.db.transaction(['snps'], 'readonly');
    const store = transaction.objectStore('snps');
    const results = [];

    return new Promise((resolve) => {
      let completed = 0;
      
      rsids.forEach(rsid => {
        const request = store.get([rsid, individualId]);
        request.onsuccess = () => {
          if (request.result) results.push(request.result);
          completed++;
          if (completed === rsids.length) resolve(results);
        };
        request.onerror = () => {
          completed++;
          if (completed === rsids.length) resolve(results);
        };
      });
    });
  }

  async findByPositions(positions, individualId) {
    const transaction = this.db.transaction(['snps'], 'readonly');
    const store = transaction.objectStore('snps');
    const results = [];
    let scanned = 0;

    return new Promise((resolve) => {
      const request = store.index('individualId').openCursor(individualId);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          scanned++;
          const record = cursor.value;
          const key = `${record.chromosome}:${record.position}`;
          if (positions.has(key)) {
            results.push(record);
          }
          cursor.continue();
        } else {
          console.log(`Scanned ${scanned} records, found ${results.length} matches`);
          resolve(results);
        }
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