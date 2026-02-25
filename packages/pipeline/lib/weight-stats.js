// Calculate theoretical PGS distribution from allele frequencies
// Gold standard approach for consumer DNA normalization

import { gunzipSync } from 'zlib';
import { readFileSync } from 'fs';

export async function calculateWeightStats(pgsId, pgsApiClient) {
  try {
    const fileContent = await pgsApiClient.getPGSFile(pgsId);
    
    // Find header and column indices
    let weightColIdx = -1;
    let afColIdx = -1;
    let pos = 0;
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (line.startsWith('#')) continue;
      
      const cols = line.split('\t');
      weightColIdx = cols.findIndex(c => c === 'effect_weight' || c === 'weight');
      afColIdx = cols.findIndex(c => c === 'allelefrequency_effect' || c === 'effect_allele_frequency');
      
      if (weightColIdx === -1) return null;
      break;
    }
    
    // Calculate theoretical distribution: E[PGS] = Σ(w_i * 2 * af_i), Var[PGS] = Σ(w_i² * 2 * af_i * (1-af_i))
    let meanSum = 0;
    let varianceSum = 0;
    let count = 0;
    
    while (pos < fileContent.length) {
      const nextNewline = fileContent.indexOf('\n', pos);
      if (nextNewline === -1) break;
      
      const line = fileContent.slice(pos, nextNewline);
      pos = nextNewline + 1;
      
      if (!line) continue;
      
      const cols = line.split('\t');
      const weight = parseFloat(cols[weightColIdx]);
      const af = afColIdx >= 0 ? parseFloat(cols[afColIdx]) : 0.5; // Default to 0.5 if missing
      
      if (!isNaN(weight) && !isNaN(af) && af >= 0 && af <= 1) {
        meanSum += weight * 2 * af;
        varianceSum += weight * weight * 2 * af * (1 - af);
        count++;
      }
    }
    
    if (count === 0) return null;
    
    const mean = meanSum;
    const sd = Math.sqrt(varianceSum);
    
    return { mean, sd, count };
  } catch (error) {
    console.error(`Error calculating theoretical distribution for ${pgsId}:`, error.message);
    return null;
  }
}

