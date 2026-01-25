#!/usr/bin/env node
/**
 * Download and prepare 1000 Genomes Project data
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const genomesDir = process.argv[2] || './1000genomes';
const vcfDir = join(genomesDir, 'vcf');

mkdirSync(vcfDir, { recursive: true });

console.log('=== 1000 Genomes Project Data Setup ===');
console.log(`Target directory: ${genomesDir}\n`);

// Download sample panel
const panelPath = join(genomesDir, 'integrated_call_samples_v3.20130502.ALL.panel');
if (!existsSync(panelPath)) {
  console.log('Downloading sample panel...');
  execSync(`wget -q -O "${panelPath}" ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/integrated_call_samples_v3.20130502.ALL.panel`);
}

const sampleCount = readFileSync(panelPath, 'utf-8').split('\n').length - 2;
console.log(`Found ${sampleCount} samples\n`);

console.log('Downloading VCF files (this will take a while - ~200GB)...');
console.log('You can interrupt and resume - wget will continue partial downloads\n');

// Download autosomes
for (let chr = 1; chr <= 22; chr++) {
  const vcfPath = join(vcfDir, `chr${chr}.vcf.gz`);
  
  if (existsSync(vcfPath)) {
    console.log(`Chromosome ${chr} already downloaded, skipping...`);
    continue;
  }
  
  console.log(`Downloading chromosome ${chr}...`);
  const url = `ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chr${chr}.phase3_shapeit2_mvncall_integrated_v5b.20130502.genotypes.vcf.gz`;
  
  try {
    execSync(`wget -c -q --show-progress -O "${vcfPath}" "${url}"`, { stdio: 'inherit' });
    execSync(`wget -c -q -O "${vcfPath}.tbi" "${url}.tbi"`);
  } catch (err) {
    console.log(`  Warning: Could not download chr${chr}, skipping...`);
    execSync(`rm -f "${vcfPath}"`);
  }
}

// Chromosome X
const chrXPath = join(vcfDir, 'chrX.vcf.gz');
if (!existsSync(chrXPath)) {
  console.log('Downloading chromosome X...');
  const url = 'ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/ALL.chrX.phase3_shapeit2_mvncall_integrated_v1c.20130502.genotypes.vcf.gz';
  try {
    execSync(`wget -c -q --show-progress -O "${chrXPath}" "${url}"`, { stdio: 'inherit' });
    execSync(`wget -c -q -O "${chrXPath}.tbi" "${url}.tbi"`);
  } catch (err) {
    console.log('  Warning: Could not download chrX, skipping...');
    execSync(`rm -f "${chrXPath}"`);
  }
} else {
  console.log('Chromosome X already downloaded, skipping...');
}

console.log('\n=== Download Complete ===');
const totalSize = execSync(`du -sh ${genomesDir} | cut -f1`).toString().trim();
const chrCount = execSync(`ls ${vcfDir}/*.vcf.gz 2>/dev/null | wc -l`).toString().trim();
console.log(`Data location: ${genomesDir}`);
console.log(`Total size: ${totalSize}`);
console.log(`Downloaded chromosomes: ${chrCount}\n`);

// Convert to PLINK2 binary format
const bedPath = join(genomesDir, 'chr1.bed');
if (!existsSync(bedPath)) {
  console.log('=== Converting VCF to PLINK2 binary format ===');
  console.log('This is a one-time preprocessing step...\n');
  
  const vcfToPlink = spawn('node', [join(__dirname, 'vcf-to-plink.js'), vcfDir, genomesDir], {
    stdio: 'inherit'
  });
  
  await new Promise((resolve, reject) => {
    vcfToPlink.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`VCF conversion failed with code ${code}`));
    });
  });
} else {
  console.log(`PLINK binary files already exist: ${genomesDir}/chr*.bed`);
}

console.log('\n=== Setup Complete ===');
console.log('Next steps:');
console.log('  1. Run empirical calculator: pnpm pipeline empirical');
console.log('  2. This will compute PGS distributions for all traits (~hours to days)');
console.log('  3. Results will be merged into manifest.duckdb');
