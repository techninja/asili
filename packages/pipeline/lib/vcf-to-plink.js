#!/usr/bin/env node
/**
 * Convert 1000 Genomes VCF files to PLINK2 binary format for fast PGS calculations
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const vcfDir = process.argv[2] || './1000genomes/vcf';
const outputDir = process.argv[3] || './1000genomes';

console.log('Converting VCF files to PLINK2 binary format...\n');

const chromosomes = [...Array(22).keys()].map(i => String(i + 1)).concat(['X']);

for (let chrIdx = 0; chrIdx < chromosomes.length; chrIdx++) {
  const chr = chromosomes[chrIdx];
  const bedFile = join(outputDir, `chr${chr}.bed`);
  
  if (existsSync(bedFile)) {
    console.log(`[${chrIdx + 1}/${chromosomes.length}] Chromosome ${chr} already converted, skipping...`);
    continue;
  }
  
  const vcfPath = join(vcfDir, `chr${chr}.vcf.gz`);
  if (!existsSync(vcfPath)) {
    console.log(`[${chrIdx + 1}/${chromosomes.length}] Warning: ${vcfPath} not found, skipping...`);
    continue;
  }
  
  console.log(`[${chrIdx + 1}/${chromosomes.length}] Converting chromosome ${chr}...`);
  
  const outPrefix = join(outputDir, `chr${chr}`);
  
  try {
    execSync(
      `plink2 --vcf ${vcfPath} --make-bed --out ${outPrefix} --max-alleles 2 --snps-only --set-missing-var-ids '@:#:\$r:\$a'`,
      { stdio: 'inherit' }
    );
    console.log(`  ✓ Created ${outPrefix}.bed/.bim/.fam`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

console.log('\n✓ Done! PLINK binary files ready for PGS calculations');
