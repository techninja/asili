#!/usr/bin/env node
import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data_out/risk_scores.db');
const CATALOG_PATH = path.join(__dirname, '../packages/pipeline/trait_catalog.json');

const THRESHOLDS = {
  extreme: 1000,
  high: 100,
  suspicious: 50
};

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

function analyzeScore(score, traitId, catalog) {
  const trait = catalog.traits[traitId];
  if (!trait) return { level: 'unknown', reason: 'Trait not in catalog' };
  
  const absScore = Math.abs(score);
  
  if (absScore > THRESHOLDS.extreme) {
    return { level: 'extreme', reason: `Score ${score.toFixed(2)} exceeds extreme threshold` };
  }
  if (absScore > THRESHOLDS.high) {
    return { level: 'high', reason: `Score ${score.toFixed(2)} exceeds high threshold` };
  }
  if (absScore > THRESHOLDS.suspicious) {
    return { level: 'suspicious', reason: `Score ${score.toFixed(2)} exceeds suspicious threshold` };
  }
  
  return { level: 'normal', reason: 'Within normal range' };
}

function analyzePGSScore(pgsId, pgsScore, trait) {
  const pgsInfo = trait.pgs_ids.find(p => p.id === pgsId);
  if (!pgsInfo) return null;
  
  const { norm_mean, norm_sd, weight_type, method } = pgsInfo;
  
  if (!norm_mean || !norm_sd) {
    return { issue: 'missing_stats', pgsId, weight_type, method };
  }
  
  const zScore = (pgsScore - norm_mean) / norm_sd;
  const absZ = Math.abs(zScore);
  
  if (absZ > 10) {
    return { 
      issue: 'extreme_zscore', 
      pgsId, 
      score: pgsScore, 
      mean: norm_mean, 
      sd: norm_sd, 
      zScore: zScore.toFixed(2),
      weight_type,
      method
    };
  }
  
  if (absZ > 5) {
    return { 
      issue: 'high_zscore', 
      pgsId, 
      score: pgsScore, 
      mean: norm_mean, 
      sd: norm_sd, 
      zScore: zScore.toFixed(2),
      weight_type,
      method
    };
  }
  
  return null;
}

function validate() {
  console.log(chalk.cyan('\n=== Risk Score Validation ===\n'));
  
  const catalog = loadCatalog();
  const individuals = queryDB('SELECT DISTINCT individual_id FROM risk_scores');
  console.log(chalk.blue(`Found ${individuals.length} individuals\n`));
  
  const issues = {
    extreme: [],
    high: [],
    suspicious: [],
    pgs_extreme: [],
    pgs_high: []
  };
  
  for (const { individual_id } of individuals) {
    console.log(chalk.yellow(`\nAnalyzing: ${individual_id}`));
    
    const scores = queryDB(`
      SELECT trait_id, risk_score, pgs_details 
      FROM risk_scores 
      WHERE individual_id = '${individual_id}' AND risk_score IS NOT NULL
      ORDER BY ABS(risk_score) DESC
    `);
    
    for (const { trait_id, risk_score, pgs_details } of scores) {
      const analysis = analyzeScore(risk_score, trait_id, catalog);
      
      if (analysis.level !== 'normal' && analysis.level !== 'unknown') {
        const trait = catalog.traits[trait_id];
        const entry = {
          individual_id,
          trait_id,
          trait_title: trait?.title || 'Unknown',
          risk_score,
          ...analysis
        };
        
        issues[analysis.level].push(entry);
        
        if (pgs_details && trait) {
          try {
            const details = JSON.parse(pgs_details);
            for (const [pgsId, data] of Object.entries(details)) {
              const pgsIssue = analyzePGSScore(pgsId, data.score, trait);
              if (pgsIssue) {
                if (pgsIssue.issue === 'extreme_zscore') {
                  issues.pgs_extreme.push({ individual_id, trait_id, trait_title: trait.title, ...pgsIssue });
                } else if (pgsIssue.issue === 'high_zscore') {
                  issues.pgs_high.push({ individual_id, trait_id, trait_title: trait.title, ...pgsIssue });
                }
              }
            }
          } catch (e) {
            console.log(chalk.red(`    Error parsing PGS details for ${trait_id}: ${e.message}`));
          }
        }
      }
    }
  }
  
  console.log(chalk.cyan('\n\n=== Summary ===\n'));
  
  if (issues.extreme.length > 0) {
    console.log(chalk.red(`\n🔴 EXTREME Risk Scores (>${THRESHOLDS.extreme}): ${issues.extreme.length}`));
    for (const issue of issues.extreme.slice(0, 10)) {
      console.log(chalk.red(`  ${issue.individual_id} | ${issue.trait_id} (${issue.trait_title})`));
      console.log(chalk.red(`    Score: ${issue.risk_score.toFixed(2)}`));
    }
    if (issues.extreme.length > 10) {
      console.log(chalk.gray(`  ... and ${issues.extreme.length - 10} more`));
    }
  }
  
  if (issues.high.length > 0) {
    console.log(chalk.yellow(`\n🟡 HIGH Risk Scores (>${THRESHOLDS.high}): ${issues.high.length}`));
    for (const issue of issues.high.slice(0, 10)) {
      console.log(chalk.yellow(`  ${issue.individual_id} | ${issue.trait_id} (${issue.trait_title})`));
      console.log(chalk.yellow(`    Score: ${issue.risk_score.toFixed(2)}`));
    }
    if (issues.high.length > 10) {
      console.log(chalk.gray(`  ... and ${issues.high.length - 10} more`));
    }
  }
  
  if (issues.pgs_extreme.length > 0) {
    console.log(chalk.red(`\n🔴 EXTREME PGS Z-Scores (>10σ): ${issues.pgs_extreme.length}`));
    for (const issue of issues.pgs_extreme.slice(0, 10)) {
      console.log(chalk.red(`  ${issue.individual_id} | ${issue.trait_id} (${issue.trait_title})`));
      console.log(chalk.red(`    ${issue.pgsId}: score=${issue.score.toFixed(2)}, z=${issue.zScore}`));
      console.log(chalk.red(`    mean=${issue.mean.toFixed(2)}, sd=${issue.sd.toFixed(2)}`));
      console.log(chalk.gray(`    ${issue.weight_type} | ${issue.method}`));
    }
    if (issues.pgs_extreme.length > 10) {
      console.log(chalk.gray(`  ... and ${issues.pgs_extreme.length - 10} more`));
    }
  }
  
  if (issues.pgs_high.length > 0) {
    console.log(chalk.yellow(`\n🟡 HIGH PGS Z-Scores (>5σ): ${issues.pgs_high.length}`));
    for (const issue of issues.pgs_high.slice(0, 10)) {
      console.log(chalk.yellow(`  ${issue.individual_id} | ${issue.trait_id} (${issue.trait_title})`));
      console.log(chalk.yellow(`    ${issue.pgsId}: score=${issue.score.toFixed(2)}, z=${issue.zScore}`));
      console.log(chalk.yellow(`    mean=${issue.mean.toFixed(2)}, sd=${issue.sd.toFixed(2)}`));
      console.log(chalk.gray(`    ${issue.weight_type} | ${issue.method}`));
    }
    if (issues.pgs_high.length > 10) {
      console.log(chalk.gray(`  ... and ${issues.pgs_high.length - 10} more`));
    }
  }
  
  if (issues.extreme.length === 0 && issues.high.length === 0 && 
      issues.pgs_extreme.length === 0 && issues.pgs_high.length === 0) {
    console.log(chalk.green('✓ No significant issues found!'));
  }
  
  console.log(chalk.cyan('\n=== Recommendations ===\n'));
  
  if (issues.extreme.length > 0 || issues.pgs_extreme.length > 0) {
    console.log(chalk.yellow('1. Review extreme scores - likely incompatible PGS scales'));
    console.log(chalk.yellow('2. Check trait catalog for affected traits'));
    console.log(chalk.yellow('3. Consider adding filters to pgs-filter.js'));
  }
  
  if (issues.high.length > 0 || issues.pgs_high.length > 0) {
    console.log(chalk.yellow('4. Investigate high scores for potential scale mismatches'));
    console.log(chalk.yellow('5. Verify weight_type and method for flagged PGS'));
  }
  
  console.log('');
}

function analyze() {
  console.log(chalk.cyan('\n=== Score Distribution Analysis ===\n'));
  
  console.log(chalk.yellow('Risk Score Distribution:'));
  const dist = queryDB(`
    SELECT 
      CASE 
        WHEN ABS(risk_score) < 1 THEN '0-1'
        WHEN ABS(risk_score) < 10 THEN '1-10'
        WHEN ABS(risk_score) < 50 THEN '10-50'
        WHEN ABS(risk_score) < 100 THEN '50-100'
        WHEN ABS(risk_score) < 500 THEN '100-500'
        ELSE '>500'
      END as range,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
    FROM risk_scores 
    GROUP BY range
    ORDER BY 
      CASE range
        WHEN '0-1' THEN 1
        WHEN '1-10' THEN 2
        WHEN '10-50' THEN 3
        WHEN '50-100' THEN 4
        WHEN '100-500' THEN 5
        ELSE 6
      END
  `);
  
  dist.forEach(row => {
    console.log(`  ${row.range.padEnd(10)} ${String(row.count).padStart(4)} (${row.pct}%)`);
  });
  
  const zCheck = queryDB('SELECT COUNT(*) as total, COUNT(z_score) as with_z FROM risk_scores');
  const { total, with_z } = zCheck[0];
  
  if (with_z === 0) {
    console.log(chalk.red('\n⚠️  Z-scores not yet populated. Recalculate risk scores to enable z-score analysis.\n'));
    return;
  }
  
  console.log(chalk.green(`\n✓ Z-scores populated: ${with_z}/${total}\n`));
  
  console.log(chalk.yellow('Z-Score Distribution:'));
  const zDist = queryDB(`
    SELECT 
      CASE 
        WHEN ABS(z_score) < 1 THEN '0-1σ'
        WHEN ABS(z_score) < 2 THEN '1-2σ'
        WHEN ABS(z_score) < 3 THEN '2-3σ'
        WHEN ABS(z_score) < 5 THEN '3-5σ'
        WHEN ABS(z_score) < 10 THEN '5-10σ'
        ELSE '>10σ'
      END as range,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
    FROM risk_scores 
    WHERE z_score IS NOT NULL
    GROUP BY range
    ORDER BY 
      CASE range
        WHEN '0-1σ' THEN 1
        WHEN '1-2σ' THEN 2
        WHEN '2-3σ' THEN 3
        WHEN '3-5σ' THEN 4
        WHEN '5-10σ' THEN 5
        ELSE 6
      END
  `);
  
  zDist.forEach(row => {
    const color = row.range === '>10σ' ? chalk.red : row.range === '5-10σ' ? chalk.yellow : chalk.white;
    console.log(color(`  ${row.range.padEnd(10)} ${String(row.count).padStart(4)} (${row.pct}%)`));
  });
  
  console.log(chalk.cyan('\n=== Outliers ===\n'));
  
  const extremeHigh = queryDB(`
    SELECT trait_id, individual_id, ROUND(risk_score, 2) as score, ROUND(z_score, 2) as z
    FROM risk_scores 
    WHERE z_score > 10
    ORDER BY z_score DESC
    LIMIT 5
  `);
  
  const extremeLow = queryDB(`
    SELECT trait_id, individual_id, ROUND(risk_score, 2) as score, ROUND(z_score, 2) as z
    FROM risk_scores 
    WHERE z_score < -10
    ORDER BY z_score
    LIMIT 5
  `);
  
  if (extremeHigh.length > 0) {
    console.log(chalk.red('Extreme High Z-Scores (>10σ):'));
    extremeHigh.forEach(row => {
      console.log(chalk.red(`  ${row.trait_id}: score=${row.score}, z=${row.z}`));
    });
  }
  
  if (extremeLow.length > 0) {
    console.log(chalk.red('\nExtreme Low Z-Scores (<-10σ):'));
    extremeLow.forEach(row => {
      console.log(chalk.red(`  ${row.trait_id}: score=${row.score}, z=${row.z}`));
    });
  }
  
  console.log('');
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'validate') {
    validate();
  } else if (command === 'analyze') {
    analyze();
  } else {
    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Validate risk scores', value: 'validate' },
        { title: 'Analyze score distribution', value: 'analyze' }
      ]
    });
    
    if (response.action === 'validate') {
      validate();
    } else if (response.action === 'analyze') {
      analyze();
    }
  }
}

main();
