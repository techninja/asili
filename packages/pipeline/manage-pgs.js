import chalk from 'chalk';
import prompts from 'prompts';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

async function calcRefStats() {
  console.log(chalk.cyan('\n=== Calculate PGS Reference Statistics ===\n'));
  
  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: 'Select calculation mode:',
    choices: [
      { title: 'Batch (all missing)', value: 'batch' },
      { title: 'Single PGS', value: 'single' },
      { title: 'Reset all stats', value: 'reset' }
    ]
  });

  if (!mode) return;

  if (mode === 'single') {
    const { pgsId } = await prompts({
      type: 'text',
      name: 'pgsId',
      message: 'Enter PGS ID (e.g., PGS000001):',
      validate: value => value.trim().length > 0 || 'PGS ID cannot be empty'
    });

    if (!pgsId) return;
    
    console.log(chalk.blue(`\nCalculating reference statistics for ${pgsId}...\n`));
    execSync(`node scripts/calc-pgs-refstats.js ${pgsId}`, { cwd: rootDir, stdio: 'inherit' });
  } else if (mode === 'reset') {
    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Reset ALL PGS normalization statistics?',
      initial: false
    });

    if (!confirm) return;
    
    console.log(chalk.blue('\nResetting all PGS statistics...\n'));
    execSync('node scripts/calc-pgs-refstats.js reset', { cwd: rootDir, stdio: 'inherit' });
  } else {
    console.log(chalk.blue('\nCalculating reference statistics for all missing PGS...\n'));
    execSync('node scripts/calc-pgs-refstats.js batch', { cwd: rootDir, stdio: 'inherit' });
  }
}

async function checkPGS() {
  console.log(chalk.cyan('\n=== Check PGS Score ===\n'));
  
  const { pgsId } = await prompts({
    type: 'text',
    name: 'pgsId',
    message: 'Enter PGS ID to check (e.g., PGS000001):',
    validate: value => value.trim().length > 0 || 'PGS ID cannot be empty'
  });

  if (!pgsId) return;
  
  console.log(chalk.blue(`\nChecking ${pgsId}...\n`));
  execSync(`node scripts/check-pgs.js ${pgsId}`, { cwd: rootDir, stdio: 'inherit' });
}

async function analyzeProblematic() {
  console.log(chalk.cyan('\n=== Analyze Problematic PGS ===\n'));
  console.log(chalk.blue('Analyzing PGS scores with issues...\n'));
  execSync('node scripts/analyze-problematic-pgs.js', { cwd: rootDir, stdio: 'inherit' });
}

async function viewScores() {
  console.log(chalk.cyan('\n=== View PGS Scores ===\n'));
  console.log(chalk.blue('Displaying PGS score information...\n'));
  execSync('node scripts/scores.js', { cwd: rootDir, stdio: 'inherit' });
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'calc') {
    await calcRefStats();
    return;
  }
  
  if (command === 'check') {
    await checkPGS();
    return;
  }
  
  if (command === 'analyze') {
    await analyzeProblematic();
    return;
  }
  
  if (command === 'scores') {
    await viewScores();
    return;
  }
  
  console.log(chalk.bold.blue('\n🧬 Asili PGS Manager\n'));

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: '📊 Calculate reference statistics', value: 'calc' },
      { title: '🔍 Check PGS score', value: 'check' },
      { title: '⚠️  Analyze problematic PGS', value: 'analyze' },
      { title: '📋 View PGS scores', value: 'scores' },
      { title: '🚪 Exit', value: 'exit' }
    ]
  });

  switch (action) {
    case 'calc':
      await calcRefStats();
      break;
    case 'check':
      await checkPGS();
      break;
    case 'analyze':
      await analyzeProblematic();
      break;
    case 'scores':
      await viewScores();
      break;
    case 'exit':
      console.log(chalk.gray('Goodbye!'));
      return;
  }

  const { continue: shouldContinue } = await prompts({
    type: 'confirm',
    name: 'continue',
    message: 'Do something else?',
    initial: true
  });

  if (shouldContinue) {
    await main();
  }
}

main().catch(console.error);
