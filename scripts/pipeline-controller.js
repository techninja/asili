#!/usr/bin/env node
/**
 * Pipeline Controller
 * Manages different pipeline execution modes via Docker
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

const MODES = {
  etl: {
    desc: 'Run standard ETL pipeline (PGS Catalog → Parquet)',
    cmd: 'node --max-old-space-size=8192 etl_orchestrator.js'
  },
  empirical: {
    desc: 'Compute empirical distributions from 1000 Genomes',
    cmd: 'node --expose-gc lib/empirical-calculator.js /output /output/1000genomes',
    requires: ['1000genomes data']
  },
  'empirical-setup': {
    desc: 'Download 1000 Genomes data and preprocess to DuckDB (~200GB)',
    cmd: 'node lib/setup-1000genomes.js /output/1000genomes'
  }
};

function printUsage() {
  console.log('Usage: pnpm pipeline <mode> [options]\n');
  console.log('Modes:');
  for (const [mode, config] of Object.entries(MODES)) {
    console.log(`  ${mode.padEnd(20)} ${config.desc}`);
    if (config.requires) {
      console.log(`  ${' '.repeat(20)} Requires: ${config.requires.join(', ')}`);
    }
  }
  console.log('\nOptions:');
  console.log('  --traits <id1,id2>   Only process specific trait IDs');
  console.log('  --populations <pop>  Compute for specific populations (ALL,EUR,AFR,EAS,SAS,AMR)');
  console.log('\nExamples:');
  console.log('  pnpm pipeline etl');
  console.log('  pnpm pipeline empirical-setup');
  console.log('  pnpm pipeline empirical --traits EFO_0005106,MONDO_0005010');
  console.log('  pnpm pipeline empirical --populations EUR,AFR');
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const mode = args[0];
  if (!MODES[mode]) {
    console.error(`Error: Unknown mode "${mode}"\n`);
    printUsage();
    process.exit(1);
  }

  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--traits' && args[i + 1]) {
      options.traits = args[++i].split(',');
    } else if (args[i] === '--populations' && args[i + 1]) {
      options.populations = args[++i].split(',');
    }
  }

  return { mode, options };
}

function buildDockerCommand(mode, options) {
  const config = MODES[mode];
  let cmd = config.cmd;

  // Add options to command
  if (options.traits) {
    cmd += ` --traits ${options.traits.join(',')}`;
  }
  if (options.populations) {
    cmd += ` --populations ${options.populations.join(',')}`;
  }

  // Build docker compose command - no extra volume mount needed
  const dockerCmd = [
    'docker', 'compose', 'run', '--rm',
    'pipeline',
    'sh', '-c', cmd
  ];

  return dockerCmd;
}

function runPipeline(mode, options) {
  console.log(`🚀 Starting pipeline mode: ${mode}`);
  if (Object.keys(options).length > 0) {
    console.log(`   Options: ${JSON.stringify(options)}`);
  }
  console.log('');

  const dockerCmd = buildDockerCommand(mode, options);
  
  const proc = spawn(dockerCmd[0], dockerCmd.slice(1), {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  proc.on('exit', (code) => {
    if (code === 0) {
      console.log('\n✅ Pipeline completed successfully');
    } else {
      console.error(`\n❌ Pipeline failed with code ${code}`);
      process.exit(code);
    }
  });

  proc.on('error', (err) => {
    console.error('❌ Failed to start pipeline:', err.message);
    process.exit(1);
  });
}

// Main
const { mode, options } = parseArgs();
runPipeline(mode, options);
