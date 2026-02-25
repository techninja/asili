#!/usr/bin/env node
import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prompts from 'prompts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data_out/risk_scores.db');
const MANIFEST_PATH = path.join(__dirname, '../data_out/trait_manifest.db');
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

function queryManifest(sql) {
  const result = execSync(`duckdb "${MANIFEST_PATH}" -json -c "${sql.replace(/"/g, '\\"')}"`, {
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
  if (!trait.pgs_ids || !Array.isArray(trait.pgs_ids)) return null;
  
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

function inspectTrait(traitId) {
  console.log(chalk.cyan(`\n=== Inspecting ${traitId} ===\n`));
  
  const catalog = loadCatalog();
  const trait = catalog.traits[traitId];
  
  if (!trait) {
    console.log(chalk.red('Trait not found in catalog'));
    return;
  }
  
  console.log(chalk.yellow(`Title: ${trait.title}`));
  
  const pgsData = queryManifest(`
    SELECT s.pgs_id, s.weight_type, s.method_name, s.variants_count, s.norm_mean, s.norm_sd
    FROM trait_pgs tp
    JOIN pgs_scores s ON tp.pgs_id = s.pgs_id
    WHERE tp.trait_id = '${traitId}'
    ORDER BY s.pgs_id
  `);
  
  console.log(chalk.yellow(`PGS Count: ${pgsData.length}\n`));
  
  if (pgsData.length > 0) {
    console.log(chalk.cyan('PGS Details:'));
    pgsData.forEach(pgs => {
      console.log(`\n  ${chalk.bold(pgs.pgs_id)}`);
      console.log(`    Weight Type: ${pgs.weight_type}`);
      console.log(`    Method: ${pgs.method_name}`);
      console.log(`    Variants: ${pgs.variants_count}`);
      console.log(`    Mean: ${pgs.norm_mean?.toFixed(2) || 'N/A'}`);
      console.log(`    SD: ${pgs.norm_sd?.toFixed(2) || 'N/A'}`);
    });
  }
  
  const scores = queryDB(`
    SELECT individual_id, overall_z_score, value
    FROM trait_results
    WHERE trait_id = '${traitId}'
    ORDER BY ABS(overall_z_score) DESC
  `);
  
  console.log(chalk.cyan(`\n\nIndividual Scores (${scores.length} total):\n`));
  
  scores.forEach(({ individual_id, overall_z_score, value }) => {
    const displayValue = value !== null ? ` (value: ${value.toFixed(2)})` : '';
    console.log(`  ${individual_id}: z=${chalk.bold(overall_z_score?.toFixed(2) || 'N/A')}${displayValue}`);
    
    const pgsScores = queryDB(`
      SELECT pgs_id, raw_score, z_score, matched_variants, expected_variants
      FROM pgs_results
      WHERE individual_id = '${individual_id}' AND trait_id = '${traitId}'
      ORDER BY pgs_id
    `);
    
    pgsScores.forEach(({ pgs_id, raw_score, z_score, matched_variants, expected_variants }) => {
      console.log(`    ${pgs_id}: raw=${raw_score?.toFixed(2) || 'N/A'}, z=${z_score?.toFixed(2) || 'N/A'} (${matched_variants}/${expected_variants} variants)`);
    });
  });
  
  console.log('');
}

function validate() {
  console.log(chalk.cyan('\n=== Risk Score Validation ===\n'));
  
  const catalog = loadCatalog();
  const individuals = queryDB('SELECT DISTINCT individual_id FROM trait_results');
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
      SELECT trait_id, overall_z_score, value 
      FROM trait_results 
      WHERE individual_id = '${individual_id}' AND overall_z_score IS NOT NULL
      ORDER BY ABS(overall_z_score) DESC
    `);
    
    for (const { trait_id, overall_z_score, value } of scores) {
      const analysis = analyzeScore(overall_z_score, trait_id, catalog);
      
      if (analysis.level !== 'normal' && analysis.level !== 'unknown') {
        const trait = catalog.traits[trait_id];
        const entry = {
          individual_id,
          trait_id,
          trait_title: trait?.title || 'Unknown',
          overall_z_score,
          value,
          ...analysis
        };
        
        issues[analysis.level].push(entry);
        
        if (trait && trait.pgs_ids) {
          const pgsScores = queryDB(`
            SELECT pgs_id, raw_score, z_score
            FROM pgs_results
            WHERE individual_id = '${individual_id}' AND trait_id = '${trait_id}'
          `);
          
          for (const { pgs_id, raw_score, z_score } of pgsScores) {
            if (raw_score !== null) {
              const pgsIssue = analyzePGSScore(pgs_id, raw_score, trait);
              if (pgsIssue) {
                if (pgsIssue.issue === 'extreme_zscore') {
                  issues.pgs_extreme.push({ individual_id, trait_id, trait_title: trait.title, ...pgsIssue });
                } else if (pgsIssue.issue === 'high_zscore') {
                  issues.pgs_high.push({ individual_id, trait_id, trait_title: trait.title, ...pgsIssue });
                }
              }
            }
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
      console.log(chalk.red(`    Z-Score: ${issue.overall_z_score.toFixed(2)}${issue.value !== null ? `, Value: ${issue.value.toFixed(2)}` : ''}`));
    }
    if (issues.extreme.length > 10) {
      console.log(chalk.gray(`  ... and ${issues.extreme.length - 10} more`));
    }
  }
  
  if (issues.high.length > 0) {
    console.log(chalk.yellow(`\n🟡 HIGH Risk Scores (>${THRESHOLDS.high}): ${issues.high.length}`));
    for (const issue of issues.high.slice(0, 10)) {
      console.log(chalk.yellow(`  ${issue.individual_id} | ${issue.trait_id} (${issue.trait_title})`));
      console.log(chalk.yellow(`    Z-Score: ${issue.overall_z_score.toFixed(2)}${issue.value !== null ? `, Value: ${issue.value.toFixed(2)}` : ''}`));
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
  
  console.log(chalk.yellow('Z-Score Distribution:'));
  const dist = queryDB(`
    SELECT 
      CASE 
        WHEN ABS(overall_z_score) < 1 THEN '0-1σ'
        WHEN ABS(overall_z_score) < 2 THEN '1-2σ'
        WHEN ABS(overall_z_score) < 3 THEN '2-3σ'
        WHEN ABS(overall_z_score) < 5 THEN '3-5σ'
        WHEN ABS(overall_z_score) < 10 THEN '5-10σ'
        ELSE '>10σ'
      END as range,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
    FROM trait_results 
    WHERE overall_z_score IS NOT NULL
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
  
  dist.forEach(row => {
    console.log(`  ${row.range.padEnd(10)} ${String(row.count).padStart(4)} (${row.pct}%)`);
  });
  
  const zCheck = queryDB('SELECT COUNT(*) as total, COUNT(overall_z_score) as with_z FROM trait_results');
  const { total, with_z } = zCheck[0];
  
  if (with_z === 0) {
    console.log(chalk.red('\n⚠️  Z-scores not yet populated.\n'));
    return;
  }
  
  console.log(chalk.green(`\n✓ Z-scores populated: ${with_z}/${total}\n`));
  
  console.log(chalk.yellow('PGS Raw Score Distribution:'));
  const pgsRawDist = queryDB(`
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
    FROM pgs_results 
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
  
  pgsRawDist.forEach(row => {
    const color = row.range === '>10σ' ? chalk.red : row.range === '5-10σ' ? chalk.yellow : chalk.white;
    console.log(color(`  ${row.range.padEnd(10)} ${String(row.count).padStart(4)} (${row.pct}%)`));
  });
  
  console.log(chalk.cyan('\n=== Outliers ===\n'));
  
  const extremeHigh = queryDB(`
    SELECT trait_id, individual_id, ROUND(overall_z_score, 2) as z, ROUND(value, 2) as val
    FROM trait_results 
    WHERE overall_z_score > 10
    ORDER BY overall_z_score DESC
    LIMIT 5
  `);
  
  const extremeLow = queryDB(`
    SELECT trait_id, individual_id, ROUND(overall_z_score, 2) as z, ROUND(value, 2) as val
    FROM trait_results 
    WHERE overall_z_score < -10
    ORDER BY overall_z_score
    LIMIT 5
  `);
  
  if (extremeHigh.length > 0) {
    console.log(chalk.red('Extreme High Z-Scores (>10σ):'));
    extremeHigh.forEach(row => {
      console.log(chalk.red(`  ${row.trait_id}: z=${row.z}${row.val !== null ? `, value=${row.val}` : ''}`));
    });
  }
  
  if (extremeLow.length > 0) {
    console.log(chalk.red('\nExtreme Low Z-Scores (<-10σ):'));
    extremeLow.forEach(row => {
      console.log(chalk.red(`  ${row.trait_id}: z=${row.z}${row.val !== null ? `, value=${row.val}` : ''}`));
    });
  }
  
  console.log('');
}

async function main() {
  const command = process.argv[2];
  const traitArg = process.argv[3];
  
  if (command === 'validate') {
    validate();
  } else if (command === 'analyze') {
    analyze();
  } else if (command === 'inspect' && traitArg) {
    inspectTrait(traitArg);
  } else if (command === 'inspect') {
    console.log(chalk.red('\nUsage: node scores.js inspect <TRAIT_ID>'));
    console.log(chalk.yellow('\nExample: node scores.js inspect EFO_0007777\n'));
  } else {
    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Validate risk scores', value: 'validate' },
        { title: 'Analyze score distribution', value: 'analyze' },
        { title: 'Inspect specific trait', value: 'inspect' }
      ]
    });
    
    if (response.action === 'validate') {
      validate();
    } else if (response.action === 'analyze') {
      analyze();
    } else if (response.action === 'inspect') {
      const traitResponse = await prompts({
        type: 'text',
        name: 'traitId',
        message: 'Enter trait ID to inspect:'
      });
      if (traitResponse.traitId) {
        inspectTrait(traitResponse.traitId);
      }
    }
  }
}

main();
