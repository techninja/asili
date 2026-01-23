// Calculate weight statistics for PGS normalization
// Stores mean and SD for converting raw scores to z-scores

import { gunzipSync } from 'zlib';
import { readFileSync } from 'fs';

export async function calculateWeightStats(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    
    // Find header and weight column
    let headerLine = null;
    let weightColIdx = -1;
    let pos = 0;
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (line.startsWith('#')) continue;
      
      // Found header
      const cols = line.split('\t');
      weightColIdx = cols.findIndex(c => c === 'effect_weight' || c === 'weight');
      if (weightColIdx === -1) return null;
      break;
    }
    
    // Process data lines
    const maxSample = 50000;
    let dataLines = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    const weights = [];
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (!line) continue;
      
      dataLines++;
      
      // Sample to avoid memory issues (but always include small files)
      const sampleRate = Math.max(1, Math.floor(dataLines / maxSample));
      if (dataLines > maxSample && dataLines % sampleRate !== 0) continue;
      
      const weight = parseFloat(line.split('\t')[weightColIdx]);
      if (!isNaN(weight)) {
        sum += weight;
        weights.push(weight);
        if (weight < min) min = weight;
        if (weight > max) max = weight;
      }
    }
    
    if (weights.length === 0) return null;
    
    const mean = sum / weights.length;
    
    // Calculate variance
    let sumSq = 0;
    for (const weight of weights) {
      sumSq += (weight - mean) ** 2;
    }
    
    const sd = Math.sqrt(sumSq / weights.length);
    
    return { mean, sd, min, max, count: dataLines };
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
