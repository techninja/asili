/**
 * High-performance streaming worker for large datasets (100M+ variants)
 * Uses cursor-based streaming to minimize memory footprint
 */

import { parentPort, workerData } from 'worker_threads';
import { SharedRiskCalculator } from './shared-calculator.js';
import duckdb from 'duckdb';

const { traitUrl, userDNA, offset, limit, pgsMetadata, normalizationParams } = workerData;

const db = new duckdb.Database(':memory:');
const conn = db.connect();

// Initialize with aggressive performance settings
await new Promise((resolve, reject) => {
  conn.all('INSTALL httpfs', (err) => {
    if (err) reject(err);
    else conn.all('LOAD httpfs', (err2) => {
      if (err2) reject(err2);
      else conn.all('SET http_timeout=60000; SET threads=1; SET memory_limit=\'3GB\'; SET preserve_insertion_order=false', (err3) => {
        if (err3) reject(err3);
        else resolve();
      });
    });
  });
});

const calculator = new SharedRiskCalculator(normalizationParams || {});
const dnaLookup = calculator.createDNALookup(userDNA);

// Stream processing with 100k batch size
const batchSize = 100000;
let processed = 0;
let lastProgressUpdate = Date.now();

while (processed < limit) {
  const query = `
    SELECT variant_id, effect_allele, effect_weight, pgs_id
    FROM '${traitUrl}'
    LIMIT ${batchSize} OFFSET ${offset + processed}
  `;
  
  const batch = await new Promise((resolve, reject) => {
    conn.all(query, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  
  if (batch.length === 0) break;
  
  // Process batch
  for (let i = 0; i < batch.length; i++) {
    calculator.processVariant(batch[i], dnaLookup, pgsMetadata);
  }
  
  processed += batch.length;
  
  // Throttle progress updates to every 500ms
  const now = Date.now();
  if (now - lastProgressUpdate > 500) {
    parentPort.postMessage({ type: 'progress', processed });
    lastProgressUpdate = now;
  }
  
  if (batch.length < batchSize) break;
}

// Final result
parentPort.postMessage({
  type: 'complete',
  pgsBreakdown: Object.fromEntries(calculator.pgsBreakdown),
  pgsDetails: Object.fromEntries(calculator.pgsDetails),
  totalMatches: calculator.totalMatches,
  totalScore: calculator.totalScore,
  processedCount: processed
});

conn.close();
db.close();
