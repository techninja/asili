#!/usr/bin/env node
import { execSync } from 'child_process';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, '../data_out/trait_manifest.db');
const SCORES_PATH = path.join(__dirname, '../data_out/risk_scores.db');

function queryDB(dbPath, sql) {
  const result = execSync(`duckdb "${dbPath}" -json -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  return result.trim() ? JSON.parse(result) : [];
}

const MEASUREMENT_CATEGORIES = [
  'Body measurement',
  'Cardiovascular measurement',
  'Lipid or lipoprotein measurement',
  'Hematological measurement',
  'Inflammatory measurement',
  'Other measurement'
];

function isQuantitativeTrait(categories) {
  try {
    const cats = JSON.parse(categories);
    return cats.some(cat => MEASUREMENT_CATEGORIES.includes(cat));
  } catch {
    return false;
  }
}

function analyzeQuantitativeTraits() {
  console.log(chalk.cyan('\n=== Quantitative Traits Analysis ===\n'));
  
  const traits = queryDB(MANIFEST_PATH, `
    SELECT t.trait_id, t.name, t.categories,
           COUNT(DISTINCT tp.pgs_id) as pgs_count
    FROM traits t
    LEFT JOIN trait_pgs tp ON t.trait_id = tp.trait_id
    GROUP BY t.trait_id, t.name, t.categories
  `);
  
  const quantitative = traits.filter(t => isQuantitativeTrait(t.categories));
  const disease = traits.filter(t => !isQuantitativeTrait(t.categories));
  
  console.log(chalk.yellow(`Total traits: ${traits.length}`));
  console.log(chalk.green(`Quantitative traits: ${quantitative.length}`));
  console.log(chalk.blue(`Disease/risk traits: ${disease.length}\n`));
  
  console.log(chalk.cyan('=== Quantitative Trait Examples ===\n'));
  
  for (const trait of quantitative.slice(0, 10)) {
    const cats = JSON.parse(trait.categories);
    console.log(chalk.bold(trait.name));
    console.log(`  ID: ${trait.trait_id}`);
    console.log(`  Category: ${cats.join(', ')}`);
    console.log(`  PGS Count: ${trait.pgs_count}`);
    
    const scores = queryDB(SCORES_PATH, `
      SELECT individual_id, risk_score
      FROM risk_scores
      WHERE trait_id = '${trait.trait_id}'
      LIMIT 3
    `);
    
    if (scores.length > 0) {
      console.log(`  Sample scores: ${scores.map(s => s.risk_score.toFixed(1)).join(', ')}`);
    }
    console.log('');
  }
  
  console.log(chalk.cyan('\n=== Suggested Display Strategy ===\n'));
  console.log(chalk.yellow('Quantitative Traits (measurements):'));
  console.log('  - Display as actual values with units (e.g., "BMR: 1000 kcal/day")');
  console.log('  - Show percentile rank instead of risk score');
  console.log('  - Use reference ranges (e.g., "Above average", "Normal range")');
  console.log('  - Color code based on clinical thresholds, not z-scores\n');
  
  console.log(chalk.yellow('Disease/Risk Traits:'));
  console.log('  - Display as risk scores or percentiles');
  console.log('  - Show relative risk compared to population');
  console.log('  - Use standard risk categories (Low/Medium/High)\n');
}

analyzeQuantitativeTraits();
