// Calculate weight statistics for PGS normalization
// Stores mean and SD for converting raw scores to z-scores

import { gunzipSync } from 'zlib';
import { readFileSync } from 'fs';

export async function calculateWeightStats(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    const lines = fileContent.split('\n').filter(l => l && !l.startsWith('#'));
    
    if (lines.length < 2) return null;
    
    // Sample weights for large files to avoid memory issues
    const maxSample = 50000;
    const step = Math.max(1, Math.floor((lines.length - 1) / maxSample));
    
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 1; i < lines.length; i += step) {
      const weight = parseFloat(lines[i].split('\t')[5]);
      if (!isNaN(weight)) {
        sum += weight;
        count++;
        if (weight < min) min = weight;
        if (weight > max) max = weight;
      }
    }
    
    if (count === 0) return null;
    
    const mean = sum / count;
    
    // Second pass for variance
    let sumSq = 0;
    for (let i = 1; i < lines.length; i += step) {
      const weight = parseFloat(lines[i].split('\t')[5]);
      if (!isNaN(weight)) {
        sumSq += (weight - mean) ** 2;
      }
    }
    
    const variance = sumSq / count;
    const sd = Math.sqrt(variance);
    
    return { mean, sd, min, max, count: lines.length - 1 };
  } catch (error) {
    console.error(`Error calculating weight stats for ${pgsId}:`, error.message);
    return null;
  }
}

// Load from local cache for testing
export function calculateWeightStatsFromCache(pgsId) {
  try {
    const filePath = `./cache/pgs_files/${pgsId}.txt.gz`;
    const compressed = readFileSync(filePath);
    const decompressed = gunzipSync(compressed);
    const fileContent = decompressed.toString('utf-8');
    
    const lines = fileContent.split('\n').filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) return null;
    
    // Sample for large files
    const maxSample = 50000;
    const step = Math.max(1, Math.floor((lines.length - 1) / maxSample));
    
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 1; i < lines.length; i += step) {
      const weight = parseFloat(lines[i].split('\t')[5]);
      if (!isNaN(weight)) {
        sum += weight;
        count++;
        if (weight < min) min = weight;
        if (weight > max) max = weight;
      }
    }
    
    if (count === 0) return null;
    
    const mean = sum / count;
    
    let sumSq = 0;
    for (let i = 1; i < lines.length; i += step) {
      const weight = parseFloat(lines[i].split('\t')[5]);
      if (!isNaN(weight)) {
        sumSq += (weight - mean) ** 2;
      }
    }
    
    const sd = Math.sqrt(sumSq / count);
    
    return { mean, sd, min, max, count: lines.length - 1 };
  } catch (error) {
    return null;
  }
}
