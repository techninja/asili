#!/usr/bin/env node
import { shouldExcludePGS } from './packages/pipeline/lib/pgs-filter.js';
import { calculateWeightStatsFromCache } from './packages/pipeline/lib/weight-stats.js';
import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';

const pgsId = process.argv[2];

if (!pgsId || !pgsId.match(/^PGS\d{6}$/)) {
  console.error(chalk.red('Usage: pnpm checkpgs PGS######'));
  console.error(chalk.red('Example: pnpm checkpgs PGS003846'));
  process.exit(1);
}

// Load metadata
const metadataPath = `./cache/www.pgscatalog.org/rest_score_${pgsId}/no-params.json`;
if (!existsSync(metadataPath)) {
  console.error(chalk.red(`Metadata not found: ${metadataPath}`));
  console.error(chalk.yellow('Run the pipeline to download this PGS first.'));
  process.exit(1);
}

const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
const scoreData = metadata.data;

console.log(chalk.bold.cyan(`\n=== ${pgsId} ===`));
console.log(chalk.bold('Name:'), scoreData.name || 'N/A');
console.log(chalk.bold('Trait:'), scoreData.trait_reported || 'N/A');
console.log(chalk.bold('Method name:'), scoreData.method_name || 'N/A');
console.log(chalk.bold('Method params:'), scoreData.method_params || 'N/A');
console.log(chalk.bold('Weight type:'), scoreData.weight_type || 'N/A');
console.log(chalk.bold('Variants:'), scoreData.variants_number?.toLocaleString() || 'N/A');
console.log(chalk.bold('Build:'), scoreData.variants_genomebuild || 'N/A');

// Check filtering without weight validation
console.log(chalk.bold.cyan('\n--- Filter Check (metadata only) ---'));
const metadataResult = await shouldExcludePGS(pgsId, scoreData, null);
if (metadataResult.exclude) {
  console.log(chalk.red('❌ EXCLUDED'));
  console.log(chalk.yellow('Reason:'), metadataResult.reason);
} else {
  console.log(chalk.green('✓ Passed metadata checks'));
  console.log(chalk.gray('Reason:'), metadataResult.reason);
}

// Check with weight validation if file exists
const pgsFilePath = `./cache/pgs_files/${pgsId}.txt.gz`;
if (existsSync(pgsFilePath)) {
  console.log(chalk.bold.cyan('\n--- Filter Check (with weight validation) ---'));
  const fullResult = await shouldExcludePGS(pgsId, scoreData, null);
  if (fullResult.exclude) {
    console.log(chalk.red('❌ EXCLUDED'));
    console.log(chalk.yellow('Reason:'), fullResult.reason);
  } else {
    console.log(chalk.green('✓ Passed all checks'));
    console.log(chalk.gray('Reason:'), fullResult.reason);
  }
  
  // Show weight statistics
  const pgsFilePath = `./cache/pgs_files/${pgsId}.txt.gz`;
  if (existsSync(pgsFilePath)) {
    const stats = calculateWeightStatsFromCache(pgsId);
    if (stats) {
      console.log(chalk.bold.cyan('\n--- Weight Statistics (all variants) ---'));
      console.log(chalk.bold('Count:'), stats.count.toLocaleString());
      console.log(chalk.bold('Min:'), stats.min.toExponential(4));
      console.log(chalk.bold('Max:'), stats.max.toExponential(4));
      console.log(chalk.bold('Mean:'), stats.mean.toExponential(4));
      console.log(chalk.bold('SD:'), stats.sd.toExponential(4));
      
      if (stats.sd < 0.001 && Math.abs(stats.mean) > 10) {
        console.log(chalk.red('⚠️  Suspiciously uniform weights detected!'));
      }
      
      // Show normalization guidance
      const absMax = Math.max(Math.abs(stats.min), Math.abs(stats.max));
      if (absMax > 1.0) {
        console.log(chalk.bold.cyan('\n--- Normalization Needed ---'));
        console.log(chalk.yellow('⚠️  Large weight magnitudes detected'));
        console.log(chalk.gray('   Raw scores should be normalized to z-scores:'));
        console.log(chalk.gray(`   z = (raw_score - ${stats.mean.toExponential(4)}) / ${stats.sd.toExponential(4)}`));
        console.log(chalk.gray('   Store these parameters in trait_catalog.json'));
      }
    }
  }
} else {
  console.log(chalk.yellow('\n⚠️  PGS file not found, skipping weight validation'));
}

console.log('');
