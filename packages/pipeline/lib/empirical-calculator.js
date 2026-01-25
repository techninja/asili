#!/usr/bin/env node
/**
 * Empirical PGS Distribution Calculator
 * 
 * Computes population-level score statistics by running PGS calculations
 * on 1000 Genomes Project reference samples. Generates mean/SD for proper
 * z-score normalization and percentile calculations.
 */

import { readFileSync, writeFileSync, existsSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { calculatePGSWithPlink } from './plink-calculator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const POPULATIONS = {
  ALL: 'All populations combined',
  EUR: 'European',
  AFR: 'African', 
  EAS: 'East Asian',
  SAS: 'South Asian',
  AMR: 'American'
};

export class EmpiricalCalculator {
  constructor(dataDir, genomes1000Dir, options = {}) {
    this.dataDir = dataDir;
    this.genomes1000Dir = genomes1000Dir;
    this.manifestPath = join(dataDir, 'manifest.duckdb');
    this.outputPath = join(dataDir, 'empirical_distributions.json');
    this.checkpointPath = join(dataDir, 'empirical_checkpoint.json');
    this.traitFilter = options.traits || null;
    this.populationFilter = options.populations || Object.keys(POPULATIONS);
  }

  /**
   * Load sample metadata from 1000 Genomes
   */
  loadSampleMetadata() {
    const panelPath = join(this.genomes1000Dir, 'integrated_call_samples_v3.20130502.ALL.panel');
    if (!existsSync(panelPath)) {
      throw new Error(`Sample panel not found: ${panelPath}\nDownload from: ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/`);
    }

    const lines = readFileSync(panelPath, 'utf-8').split('\n');
    const samples = {};
    
    for (let i = 1; i < lines.length; i++) {
      const [sample, pop, superpop] = lines[i].split('\t');
      if (sample) {
        samples[sample] = { pop, superpop };
      }
    }
    
    console.log(`Loaded ${Object.keys(samples).length} samples`);
    return samples;
  }

  /**
   * Load trait manifest with PGS IDs
   */
  loadTraitManifest() {
    const query = `SELECT mondo_id, name, file_path, pgs_ids FROM traits WHERE file_path IS NOT NULL`;
    const result = execSync(`duckdb ${this.manifestPath} -json -c "${query}"`, { encoding: 'utf-8' });
    
    const rows = JSON.parse(result);
    const traits = rows.map(row => ({
      trait_id: row.mondo_id,
      name: row.name,
      file_path: row.file_path,
      pgs_ids: row.pgs_ids || []
    }));

    console.log(`Loaded ${traits.length} traits from manifest`);
    return traits;
  }

  /**
   * Load trait weights into memory
   */
  async loadTraitWeights(traitFile) {
    const tempFile = `/tmp/weights_${Date.now()}.csv`;
    execSync(`duckdb -csv -c "COPY (SELECT variant_id, effect_allele, effect_weight FROM '${traitFile}') TO '${tempFile}'"`);
    
    const weights = new Map();
    const rl = createInterface({
      input: createReadStream(tempFile),
      crlfDelay: Infinity
    });
    
    let isHeader = true;
    let count = 0;
    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }
      
      const [variant_id, effect_allele, effect_weight] = line.split(',');
      if (variant_id) {
        const key = `${variant_id}_${effect_allele}`;
        weights.set(key, parseFloat(effect_weight));
        
        if (++count % 100000 === 0) {
          process.stdout.write(`\rLoading weights: ${(count / 1000000).toFixed(1)}M variants...`);
        }
      }
    }
    
    execSync(`rm -f ${tempFile}`);
    return weights;
  }

  /**
   * Calculate PGS for batch of samples (pure JS)
   */
  calculateBatchScores(batch, weights) {
    return batch.map(({ sampleId, variants }) => {
      let score = 0;
      for (const v of variants) {
        const key = `${v.rsid}_${v.alt}`;
        const weight = weights.get(key);
        if (weight !== undefined) {
          score += v.genotype === 'hom' ? weight * 2 : weight;
        }
      }
      return { sampleId, score };
    });
  }

  /**
   * Calculate statistics for a population group
   */
  calculateStats(scores) {
    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const sd = Math.sqrt(variance);
    const sorted = [...scores].sort((a, b) => a - b);

    return {
      mean: parseFloat(mean.toFixed(6)),
      sd: parseFloat(sd.toFixed(6)),
      min: parseFloat(sorted[0].toFixed(6)),
      max: parseFloat(sorted[n - 1].toFixed(6)),
      median: parseFloat(sorted[Math.floor(n / 2)].toFixed(6)),
      n
    };
  }

  /**
   * Load checkpoint if exists
   */
  loadCheckpoint() {
    if (existsSync(this.checkpointPath)) {
      return JSON.parse(readFileSync(this.checkpointPath, 'utf-8'));
    }
    return { completedTraits: [], results: {} };
  }

  /**
   * Save checkpoint
   */
  saveCheckpoint(completedTraits, results) {
    writeFileSync(this.checkpointPath, JSON.stringify({ completedTraits, results }, null, 2));
  }

  /**
   * Main computation loop
   */
  async compute() {
    console.log('Loading sample metadata...');
    const samples = this.loadSampleMetadata();
    
    console.log('Loading trait manifest...');
    let traits = this.loadTraitManifest();
    
    // Filter traits if specified
    if (this.traitFilter) {
      traits = traits.filter(t => this.traitFilter.includes(t.trait_id));
      console.log(`Filtered to ${traits.length} traits: ${this.traitFilter.join(', ')}`);
    }
    
    const checkpoint = this.loadCheckpoint();
    if (checkpoint.completedTraits.length > 0) {
      console.log(`Resuming from checkpoint: ${checkpoint.completedTraits.length} traits already completed\n`);
    }
    
    const results = checkpoint.results;
    const completedTraits = new Set(checkpoint.completedTraits);
    const startTime = Date.now();

    for (let traitIdx = 0; traitIdx < traits.length; traitIdx++) {
      const trait = traits[traitIdx];
      
      if (completedTraits.has(trait.trait_id)) {
        console.log(`[${traitIdx + 1}/${traits.length}] Skipping ${trait.name} (already completed)`);
        continue;
      }
      
      const traitStartTime = Date.now();
      
      const traitFile = join(this.dataDir, 'packs', trait.file_path);
      
      console.log(`[${traitIdx + 1}/${traits.length}] ${trait.name}`);
      
      // Use PLINK2 for fast calculation across all chromosomes
      const scoresByPop = await calculatePGSWithPlink(this.genomes1000Dir, traitFile, samples);

      // Calculate statistics for each population
      if (Object.keys(scoresByPop).length === 0 || scoresByPop.ALL.length === 0) {
        console.log(`  Skipping - no valid scores calculated`);
        continue;
      }
      
      results[trait.trait_id] = {
        pgs_ids: Array.isArray(trait.pgs_ids) ? trait.pgs_ids.map(p => p.id) : [],
        populations: {}
      };

      for (const [pop, scores] of Object.entries(scoresByPop)) {
        if (scores.length > 0) {
          results[trait.trait_id].populations[pop] = this.calculateStats(scores);
        }
      }
      
      const traitTime = ((Date.now() - traitStartTime) / 1000).toFixed(1);
      const traitsPerSec = ((traitIdx + 1) / (Date.now() - startTime) * 1000).toFixed(3);
      console.log(`  ✓ Complete in ${traitTime}s (${traitsPerSec} traits/sec avg)`);
      
      completedTraits.add(trait.trait_id);
      this.saveCheckpoint(Array.from(completedTraits), results);
      
      if (global.gc) global.gc();
    }

    // Save results
    console.log(`\nSaving results to ${this.outputPath}`);
    writeFileSync(this.outputPath, JSON.stringify(results, null, 2));
    
    return results;
  }

  /**
   * Merge empirical stats into trait manifest
   */
  mergeIntoManifest() {
    if (!existsSync(this.outputPath)) {
      throw new Error('Empirical distributions not computed yet. Run compute() first.');
    }

    const empirical = JSON.parse(readFileSync(this.outputPath, 'utf-8'));

    for (const [traitId, data] of Object.entries(empirical)) {
      const empiricalJson = JSON.stringify(data.populations).replace(/'/g, "''");
      execSync(`duckdb ${this.manifestPath} "UPDATE traits SET empirical_stats = '${empiricalJson}' WHERE mondo_id = '${traitId}'"`);
    }

    console.log('Merged empirical stats into manifest.duckdb');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dataDir = args[0] || './data_out';
  const genomes1000Dir = args[1] || './1000genomes';
  
  // Parse options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--traits' && args[i + 1]) {
      options.traits = args[++i].split(',');
    } else if (args[i] === '--populations' && args[i + 1]) {
      options.populations = args[++i].split(',');
    }
  }

  const calculator = new EmpiricalCalculator(dataDir, genomes1000Dir, options);
  
  calculator.compute()
    .then(() => calculator.mergeIntoManifest())
    .then(() => console.log('Done!'))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
