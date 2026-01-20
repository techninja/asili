/**
 * Worker thread for parallel PGS calculation
 */

import { parentPort, workerData } from 'worker_threads';
import { SharedRiskCalculator } from './shared-calculator.js';
import duckdb from 'duckdb';

const { traitUrl, userDNA, offset, limit, pgsMetadata } = workerData;

const db = new duckdb.Database(':memory:');
const conn = db.connect();

// Initialize DuckDB with performance settings
await new Promise((resolve, reject) => {
  conn.all('INSTALL httpfs', (err) => {
    if (err) reject(err);
    else conn.all('LOAD httpfs', (err2) => {
      if (err2) reject(err2);
      else conn.all('SET http_timeout=30000', (err3) => {
        if (err3) reject(err3);
        else conn.all('SET threads=1', (err4) => {
          if (err4) reject(err4);
          else conn.all('SET memory_limit=\'2GB\'', (err5) => {
            if (err5) reject(err5);
            else resolve();
          });
        });
      });
    });
  });
});

// Create calculator and DNA lookup
const calculator = new SharedRiskCalculator();
const dnaLookup = calculator.createDNALookup(userDNA);

// Process in larger batches for better throughput
const batchSize = 50000;
let processed = 0;

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
  
  batch.forEach(row => calculator.processVariant(row, dnaLookup, pgsMetadata));
  processed += batch.length;
  
  // Send progress update
  parentPort.postMessage({ type: 'progress', processed });
  
  if (batch.length < batchSize) break;
}

// Send results back
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
