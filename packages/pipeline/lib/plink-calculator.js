#!/usr/bin/env node
/**
 * Plink-based Empirical Calculator
 * Uses Plink2 for fast PGS calculations on 1000 Genomes data
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export async function calculatePGSWithPlink(plinkDir, traitParquet, sampleMetadata) {
  console.log('  Converting trait weights to Plink score format...');
  
  const scoreFile = `/tmp/score_${Date.now()}.txt`;
  execSync(`duckdb -c "COPY (SELECT variant_id, effect_allele, effect_weight FROM '${traitParquet}') TO '${scoreFile}' (FORMAT CSV, DELIMITER ' ', HEADER false)"`);
  
  console.log('  Running Plink --score across all chromosomes...');
  
  // Initialize scores for all samples
  const sampleScores = new Map();
  
  // Process each chromosome and accumulate scores
  const chromosomes = [...Array(22).keys()].map(i => String(i + 1)).concat(['X']);
  
  for (const chr of chromosomes) {
    const plinkPrefix = join(plinkDir, `chr${chr}`);
    const bedFile = `${plinkPrefix}.bed`;
    
    if (!existsSync(bedFile)) continue;
    
    const outPrefix = `/tmp/pgs_chr${chr}_${Date.now()}`;
    
    try {
      execSync(
        `plink2 --bfile ${plinkPrefix} --score ${scoreFile} 1 2 3 --out ${outPrefix}`,
        { stdio: 'pipe' }
      );
      
      // Read and accumulate scores
      const results = readFileSync(`${outPrefix}.sscore`, 'utf-8').split('\n');
      
      for (let i = 1; i < results.length; i++) {
        const line = results[i].trim();
        if (!line) continue;
        
        const parts = line.split(/\s+/);
        const sampleId = parts[0]; // FID (same as IID)
        const score = parseFloat(parts[4]); // SCORE1_SUM
        
        if (!isNaN(score)) {
          sampleScores.set(sampleId, (sampleScores.get(sampleId) || 0) + score);
        }
      }
      
      execSync(`rm -f ${outPrefix}.*`);
    } catch (err) {
      console.log(`  Warning: chr${chr} failed: ${err.message}`);
    }
  }
  
  execSync(`rm -f ${scoreFile}`);
  
  console.log(`  ✓ Calculated scores for ${sampleScores.size} samples`);
  
  // Group by population
  const scoresByPop = { ALL: [] };
  
  for (const [sampleId, score] of sampleScores) {
    const metadata = sampleMetadata[sampleId];
    if (!metadata) continue;
    
    scoresByPop.ALL.push(score);
    
    if (!scoresByPop[metadata.superpop]) {
      scoresByPop[metadata.superpop] = [];
    }
    scoresByPop[metadata.superpop].push(score);
  }
  
  return scoresByPop;
}
