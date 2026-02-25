#!/usr/bin/env node
import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data_out/risk_scores.db');
const CATALOG_PATH = path.join(__dirname, '../packages/pipeline/trait_catalog.json');

function queryDB(sql) {
  const result = execSync(`duckdb "${DB_PATH}" -json -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  return result.trim() ? JSON.parse(result) : [];
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function analyzeProblematicPGS(traitId, pgsId, catalog) {
  const trait = catalog.traits[traitId];
  if (!trait) return null;
  
  const pgsInfo = trait.pgs_ids.find(p => p.id === pgsId);
  if (!pgsInfo) return null;
  
  const { norm_mean, norm_sd, weight_type, method } = pgsInfo;
  
  const analysis = {
    pgsId,
    traitId,
    traitTitle: trait.title,
    weight_type,
    method,
    norm_mean,
    norm_sd,
    issues: [],
    suggestions: []
  };
  
  // Check for extreme mean/sd ratio
  if (norm_mean && norm_sd) {
    const ratio = Math.abs(norm_mean / norm_sd);
    if (ratio > 15) {
      analysis.issues.push(`Incompatible scale: mean/std ratio = ${ratio.toFixed(1)}`);
      analysis.suggestions.push(`Add to pgs-filter.js: Incompatible scale check for ratio > 15`);
    }
  }
  
  // Check for suspicious weight types
  if (weight_type === 'Inverse-variance weighting') {
    analysis.issues.push('Inverse-variance weighting may use incompatible scale');
    analysis.suggestions.push('Consider excluding Inverse-variance weighting in pgs-filter.js');
  }
  
  // Check for extreme means
  if (norm_mean && Math.abs(norm_mean) > 100) {
    analysis.issues.push(`Extreme mean value: ${norm_mean.toFixed(2)}`);
    analysis.suggestions.push('Add threshold check for extreme mean values');
  }
  
  // Check method patterns
  const methodLower = method.toLowerCase();
  if (methodLower.includes('inverse') || methodLower.includes('variant weights')) {
    analysis.issues.push('Method suggests non-standard weighting scheme');
    analysis.suggestions.push('Add method keyword filter for "inverse" or "variant weights"');
  }
  
  return analysis;
}

function main() {
  console.log(chalk.cyan('\n=== Problematic PGS Analysis ===\n'));
  
  const catalog = loadCatalog();
  const individuals = queryDB('SELECT DISTINCT individual_id FROM risk_scores');
  
  const problematicPGS = new Map();
  
  for (const { individual_id } of individuals) {
    const scores = queryDB(`
      SELECT trait_id, risk_score, pgs_details 
      FROM risk_scores 
      WHERE individual_id = '${individual_id}' AND risk_score IS NOT NULL
    `);
    
    for (const { trait_id, pgs_details } of scores) {
      const trait = catalog.traits[trait_id];
      if (!trait || !pgs_details) continue;
      
      try {
        const details = JSON.parse(pgs_details);
        for (const [pgsId, data] of Object.entries(details)) {
          const pgsInfo = trait.pgs_ids.find(p => p.id === pgsId);
          if (!pgsInfo) continue;
          
          const { norm_mean, norm_sd } = pgsInfo;
          if (!norm_mean || !norm_sd) continue;
          
          const zScore = Math.abs((data.score - norm_mean) / norm_sd);
          
          if (zScore > 5) {
            const key = `${trait_id}:${pgsId}`;
            if (!problematicPGS.has(key)) {
              const analysis = analyzeProblematicPGS(trait_id, pgsId, catalog);
              if (analysis) {
                analysis.maxZScore = zScore;
                analysis.occurrences = 1;
                problematicPGS.set(key, analysis);
              }
            } else {
              const existing = problematicPGS.get(key);
              existing.maxZScore = Math.max(existing.maxZScore, zScore);
              existing.occurrences++;
            }
          }
        }
      } catch (e) {
        // Skip parsing errors
      }
    }
  }
  
  const sorted = Array.from(problematicPGS.values())
    .sort((a, b) => b.maxZScore - a.maxZScore);
  
  console.log(chalk.yellow(`Found ${sorted.length} problematic PGS entries\n`));
  
  // Group by issue type
  const byIssue = new Map();
  for (const pgs of sorted) {
    for (const issue of pgs.issues) {
      if (!byIssue.has(issue)) {
        byIssue.set(issue, []);
      }
      byIssue.get(issue).push(pgs);
    }
  }
  
  console.log(chalk.cyan('=== Issues by Type ===\n'));
  
  for (const [issue, pgsList] of byIssue.entries()) {
    console.log(chalk.red(`\n${issue} (${pgsList.length} PGS)`));
    
    for (const pgs of pgsList.slice(0, 5)) {
      console.log(chalk.yellow(`  ${pgs.pgsId} | ${pgs.traitTitle}`));
      console.log(chalk.gray(`    z-score: ${pgs.maxZScore.toFixed(2)}, occurrences: ${pgs.occurrences}`));
      console.log(chalk.gray(`    mean: ${pgs.norm_mean.toFixed(2)}, sd: ${pgs.norm_sd.toFixed(2)}`));
      console.log(chalk.gray(`    ${pgs.weight_type} | ${pgs.method}`));
    }
    
    if (pgsList.length > 5) {
      console.log(chalk.gray(`  ... and ${pgsList.length - 5} more`));
    }
  }
  
  console.log(chalk.cyan('\n\n=== Suggested Filter Improvements ===\n'));
  
  const suggestions = new Set();
  for (const pgs of sorted) {
    for (const suggestion of pgs.suggestions) {
      suggestions.add(suggestion);
    }
  }
  
  let i = 1;
  for (const suggestion of suggestions) {
    console.log(chalk.green(`${i}. ${suggestion}`));
    i++;
  }
  
  console.log(chalk.cyan('\n=== Top 10 Most Problematic PGS ===\n'));
  
  for (const pgs of sorted.slice(0, 10)) {
    console.log(chalk.red(`\n${pgs.pgsId} | ${pgs.traitTitle}`));
    console.log(chalk.yellow(`  Max Z-Score: ${pgs.maxZScore.toFixed(2)}`));
    console.log(chalk.yellow(`  Occurrences: ${pgs.occurrences}`));
    console.log(chalk.gray(`  Mean: ${pgs.norm_mean.toFixed(2)}, SD: ${pgs.norm_sd.toFixed(2)}`));
    console.log(chalk.gray(`  Weight Type: ${pgs.weight_type}`));
    console.log(chalk.gray(`  Method: ${pgs.method}`));
    console.log(chalk.blue('  Issues:'));
    for (const issue of pgs.issues) {
      console.log(chalk.blue(`    - ${issue}`));
    }
  }
  
  console.log('');
}

main();
