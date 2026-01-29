import chalk from 'chalk';
import prompts from 'prompts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pgsApiClient from './pgs-api-client.js';
import { shouldExcludePGS, WEIGHT_THRESHOLDS } from './lib/pgs-filter.js';
import { calculateWeightStats } from './lib/weight-stats.js';
import { analyzeTraitPGSQuality } from './lib/pgs-enhanced-filter.js';

function generateCanonicalURI(traitId) {
  if (traitId.startsWith('TRAIT:')) {
    return `https://monarchinitiative.org/disease/${traitId}`;
  } else if (traitId.startsWith('EFO_')) {
    return `https://www.ebi.ac.uk/efo/${traitId}`;
  } else if (traitId.startsWith('HP_')) {
    return `https://hpo.jax.org/app/browse/term/${traitId}`;
  } else if (traitId.startsWith('OBA_')) {
    return `http://purl.obolibrary.org/obo/${traitId}`;
  } else if (traitId.startsWith('PATO_')) {
    return `http://purl.obolibrary.org/obo/${traitId}`;
  }
  return null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'trait_catalog.json');
const SCHEMA_PATH = path.join(__dirname, 'trait-catalog-schema.json');

// Initialize JSON schema validator
const ajv = new Ajv();
addFormats(ajv);
let catalogSchema;

async function collectTraitDescription(traitId) {
  try {
    // First try direct trait lookup
    let traitData = await pgsApiClient.getTraitInfo(traitId);
    
    // If direct lookup fails or returns empty, try search
    if (!traitData || Object.keys(traitData).length === 0) {
      const searchResults = await pgsApiClient.searchTraitsByTrait(traitId);
      
      if (searchResults?.results?.length > 0) {
        traitData = searchResults.results[0];
      }
    }
    
    if (traitData?.description) {
      return traitData.description;
    }
    
    return null; // No description found
  } catch (error) {
    console.log(chalk.yellow(`    Warning: Could not fetch description for ${traitId}: ${error.message}`));
    return null;
  }
}

async function loadSchema() {
  if (!catalogSchema) {
    const schemaData = await fs.readFile(SCHEMA_PATH, 'utf8');
    catalogSchema = JSON.parse(schemaData);
    ajv.addSchema(catalogSchema, 'catalog');
  }
  return catalogSchema;
}

function validateCatalog(catalog) {
  const validate = ajv.getSchema('catalog');
  const valid = validate(catalog);

  if (!valid) {
    console.log(chalk.red('\n❌ Catalog validation failed:'));
    validate.errors.forEach(error => {
      console.log(chalk.red(`  ${error.instancePath}: ${error.message}`));
      if (error.data !== undefined) {
        console.log(chalk.gray(`    Value: ${JSON.stringify(error.data)}`));
      }
    });

    // Debug: show actual catalog structure
    console.log(chalk.yellow('\nActual catalog structure:'));
    console.log(chalk.gray(JSON.stringify(Object.keys(catalog), null, 2)));
    if (catalog.traits) {
      console.log(chalk.yellow('Traits keys:'));
      console.log(
        chalk.gray(JSON.stringify(Object.keys(catalog.traits), null, 2))
      );
    }

    return false;
  }

  console.log(chalk.green('✓ Catalog validation passed'));
  return true;
}

async function loadCatalog() {
  await loadSchema();

  try {
    const data = await fs.readFile(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(data);

    if (!validateCatalog(catalog)) {
      throw new Error('Catalog validation failed');
    }

    return catalog;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(
        chalk.yellow('No existing catalog found, creating new one...')
      );
      return { traits: {} };
    }
    throw error;
  }
}

async function saveCatalog(catalog) {
  if (!validateCatalog(catalog)) {
    throw new Error('Cannot save invalid catalog');
  }

  await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(chalk.green('✓ Catalog saved'));
}

// Trait ID patterns and handlers
const TRAIT_ID_PATTERNS = {
  TRAIT_NUMBER: {
    regex: /^[0-9]+$/,
    format: id => `TRAIT:${id.padStart(7, '0')}`
  },
  TRAIT_FULL: { regex: /^TRAIT:[0-9]{7}$/, format: id => id },
  TRAIT_UNDERSCORE: {
    regex: /^TRAIT_[0-9]{7}$/,
    format: id => id.replace('_', ':')
  },
  EFO: { regex: /^EFO_[0-9]{7}$/, format: id => id },
  HP: { regex: /^HP_[0-9]{7}$/, format: id => id },
  OBA_VT: { regex: /^OBA_VT[0-9]{7}$/, format: id => id },
  OBA: { regex: /^OBA_[0-9]{7}$/, format: id => id },
  PATO: { regex: /^PATO_[0-9]{7}$/, format: id => id }
};

function parseTraitId(input) {
  const trimmed = input.trim();

  for (const [type, pattern] of Object.entries(TRAIT_ID_PATTERNS)) {
    if (pattern.regex.test(trimmed)) {
      return {
        type,
        id: pattern.format(trimmed),
        original: trimmed
      };
    }
  }

  return { type: 'SEARCH', id: trimmed, original: trimmed };
}

async function lookupTraitById(traitId) {
  try {
    let traitInfo = await pgsApiClient.getTraitInfo(traitId);
    let sourceId = traitId;
    let canonicalId = traitId;

    // If direct lookup succeeds, use it
    if (traitInfo && Object.keys(traitInfo).length > 0 && traitInfo.associated_pgs_ids?.length > 0) {
      // Determine canonical ID (prefer TRAIT if available)
      if (traitId.startsWith('EFO_') && traitInfo.trait_mapped_terms) {
        const mondoTerm = traitInfo.trait_mapped_terms.find(term => term.startsWith('TRAIT:'));
        if (mondoTerm) {
          canonicalId = mondoTerm;
          console.log(chalk.blue(`  Found TRAIT equivalent: ${mondoTerm}`));
        }
      }
    } else {
      // Direct lookup failed or has no PGS, try cross-standard resolution
      console.log(chalk.yellow(`  Direct lookup failed, searching for equivalent traits...`));
      
      try {
        const searchResults = await pgsApiClient.searchTraits(traitId);
        
        for (const result of searchResults.results || []) {
          // Look for traits that map to our target ID
          if (result.trait_mapped_terms?.includes(traitId) || result.ontology_trait_name === traitId) {
            const equivalentInfo = await pgsApiClient.getTraitInfo(result.id);
            if (equivalentInfo.associated_pgs_ids?.length > 0) {
              traitInfo = equivalentInfo;
              sourceId = result.id;
              canonicalId = traitId; // Keep original as canonical
              console.log(chalk.green(`  Found equivalent: ${result.id} with ${equivalentInfo.associated_pgs_ids.length} PGS scores`));
              break;
            }
          }
        }
      } catch (searchError) {
        console.log(chalk.yellow(`  Search failed: ${searchError.message}`));
      }
    }

    if (!traitInfo || Object.keys(traitInfo).length === 0) {
      return null;
    }

    return {
      canonical_id: canonicalId,
      source_id: sourceId,
      title: traitInfo.label || 'Unknown trait',
      description: traitInfo.description || '',
      pgs_count: (traitInfo.associated_pgs_ids?.length || 0) + (traitInfo.child_associated_pgs_ids?.length || 0),
      categories: traitInfo.trait_categories || []
    };
  } catch (error) {
    console.log(chalk.red(`  Lookup error: ${error.message}`));
    return null;
  }
}

async function searchTraitTraits(query) {
  console.log(chalk.blue(`Searching TRAIT traits for: ${query}`));

  try {
    const traitData = await pgsApiClient.searchTraits(query);
    const results = [];

    for (const trait of traitData.results.slice(0, 10)) {
      if (
        trait.ontology_trait_name &&
        trait.ontology_trait_name.startsWith('TRAIT:')
      ) {
        const pgsCount =
          (trait.associated_pgs_ids || []).length +
          (trait.child_associated_pgs_ids || []).length;
        results.push({
          trait_id: trait.ontology_trait_name,
          title: trait.label,
          description: trait.description || '',
          pgs_count: pgsCount
        });
      }
    }

    return results;
  } catch (error) {
    console.log(chalk.red('Error searching TRAIT traits:', error.message));
    return [];
  }
}

async function analyzeTraitQuality(traitId) {
  console.log(chalk.bold.cyan(`\n🔬 Analyzing PGS Quality for ${traitId}\n`));

  try {
    const traitInfo = await pgsApiClient.getTraitInfo(traitId);
    console.log(chalk.bold(`Trait: ${traitInfo.label}`));
    console.log(chalk.gray(`Description: ${traitInfo.description?.substring(0, 100)}...`));
    
    const allPgsIds = [
      ...(traitInfo.associated_pgs_ids || []),
      ...(traitInfo.child_associated_pgs_ids || [])
    ];
    
    console.log(chalk.blue(`\nTotal PGS scores: ${allPgsIds.length}`));
    console.log(chalk.gray('Analyzing each score...\n'));
    
    const analysis = await analyzeTraitPGSQuality(traitId, allPgsIds, pgsApiClient);
    
    console.log(chalk.bold.green(`\n✅ INCLUDED: ${analysis.included.length}/${analysis.total_pgs}`));
    console.log(chalk.bold.red(`❌ EXCLUDED: ${analysis.excluded.length}/${analysis.total_pgs}`));
    console.log(chalk.bold.yellow(`🔄 RECOVERED (NR): ${analysis.recovered_nr.length}/${analysis.total_pgs}`));
    
    console.log(chalk.bold.blue(`\n📊 Performance Summary:`));
    console.log(`   Validated: ${analysis.performance_summary.validated}`);
    console.log(`   Unvalidated: ${analysis.performance_summary.unvalidated}`);
    console.log(`   Avg Weight: ${analysis.performance_summary.avg_weight.toFixed(2)}`);
    
    if (analysis.included.length > 0) {
      console.log(chalk.bold.green(`\n✅ Included Scores (${analysis.included.length}):`));
      for (const entry of analysis.included) {
        const perfIcon = entry.performance_metrics?.has_validation ? '📈' : '❓';
        const perfText = entry.performance_metrics?.best_metric 
          ? `${entry.performance_metrics.best_metric.type}=${entry.performance_metrics.best_metric.value.toFixed(3)}`
          : 'No validation';
        
        console.log(chalk.green(`   ${perfIcon} ${entry.pgs_id}`));
        console.log(chalk.gray(`      Strategy: ${entry.strategy} | Weight: ${(entry.performance_weight || 0.5).toFixed(2)}`));
        console.log(chalk.gray(`      Type: ${entry.weight_type} | Method: ${entry.method}`));
        console.log(chalk.gray(`      Performance: ${perfText}`));
        console.log(chalk.gray(`      Variants: ${entry.variants?.toLocaleString() || 'unknown'}`));
      }
    }
    
    if (analysis.recovered_nr.length > 0) {
      console.log(chalk.bold.yellow(`\n🔄 Recovered NR Scores (${analysis.recovered_nr.length}):`));
      for (const entry of analysis.recovered_nr) {
        console.log(chalk.yellow(`   ${entry.pgs_id}: ${entry.reason}`));
        console.log(chalk.gray(`      Performance weight: ${entry.performance_weight.toFixed(2)}`));
      }
    }
    
    if (analysis.excluded.length > 0) {
      console.log(chalk.bold.red(`\n❌ Excluded Scores (${analysis.excluded.length}):`));
      
      const byReason = {};
      for (const entry of analysis.excluded) {
        const reason = entry.reason || 'Unknown';
        if (!byReason[reason]) byReason[reason] = [];
        byReason[reason].push(entry.pgs_id);
      }
      
      for (const [reason, pgsIds] of Object.entries(byReason)) {
        console.log(chalk.red(`   ${reason}: ${pgsIds.length} scores`));
        console.log(chalk.gray(`      ${pgsIds.join(', ')}`));
      }
    }
    
    const originalIncluded = analysis.included.length - analysis.recovered_nr.length;
    const recoveryRate = analysis.recovered_nr.length / analysis.total_pgs;
    const totalInclusionRate = analysis.included.length / analysis.total_pgs;
    
    console.log(chalk.bold.cyan(`\n📈 Recovery Impact:`));
    console.log(`   Original inclusion rate: ${(originalIncluded / analysis.total_pgs * 100).toFixed(1)}%`);
    console.log(`   Enhanced inclusion rate: ${(totalInclusionRate * 100).toFixed(1)}%`);
    console.log(`   Recovery gain: ${(recoveryRate * 100).toFixed(1)}%`);
    console.log(`   Remaining excluded: ${(analysis.excluded.length / analysis.total_pgs * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    console.error(error.stack);
  }
}

async function refreshTraitData() {
  console.log(chalk.cyan('\n=== Refresh Trait Data ===\n'));

  const catalog = await loadCatalog();

  if (Object.keys(catalog.traits).length === 0) {
    console.log(chalk.yellow('No traits to refresh'));
    return;
  }

  const fresh = process.argv.includes('--fresh');
  if (fresh) {
    console.log(chalk.yellow('Fresh mode: ignoring last_updated dates'));
  }

  console.log(chalk.blue('Refreshing PGS data for TRAIT traits...'));

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  for (const [traitId, trait] of Object.entries(catalog.traits)) {
    // Check if parquet file exists and compare dates
    const parquetPath = path.join(__dirname, 'data_out', 'packs', `${traitId}_hg38.parquet`);
    let shouldRebuild = fresh;
    
    if (!shouldRebuild) {
      try {
        const stats = await fs.stat(parquetPath);
        const fileDate = new Date(stats.mtime);
        const catalogDate = new Date(trait.last_updated);
        
        if (catalogDate > fileDate) {
          console.log(chalk.yellow(`  Parquet outdated: catalog ${catalogDate.toDateString()} > file ${fileDate.toDateString()}`));
          shouldRebuild = true;
        }
      } catch (error) {
        console.log(chalk.yellow(`  Parquet file missing`));
        shouldRebuild = true;
      }
    }
    
    // Skip if updated within last month AND has PGS IDs AND parquet is current (unless fresh mode)
    if (!shouldRebuild && trait.last_updated && trait.pgs_ids.length > 0) {
      const lastUpdate = new Date(trait.last_updated);
      if (lastUpdate > oneMonthAgo) {
        console.log(
          chalk.gray(
            `Skipping ${trait.title} (updated ${lastUpdate.toDateString()})`
          )
        );
        continue;
      }
    }

    console.log(chalk.gray(`Processing ${trait.title} (${traitId})...`));

    // Use cross-standard trait resolution to get PGS IDs
    let allPgsIds = [];
    let traitTitle = trait.title; // Keep existing title as fallback
    let sourceId = traitId; // Default to canonical ID

    // First try direct lookup with canonical ID
    try {
      const traitInfo = await pgsApiClient.getTraitInfo(traitId);
      if (traitInfo.associated_pgs_ids && traitInfo.associated_pgs_ids.length > 0) {
        console.log(chalk.blue(`  Found ${traitInfo.associated_pgs_ids.length} PGS scores via canonical ID`));
        allPgsIds = traitInfo.associated_pgs_ids.filter(id => id.match(/^PGS[0-9]{6}$/));
        if (traitInfo.label && traitInfo.label.trim()) {
          traitTitle = traitInfo.label.trim();
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`  Canonical ID lookup failed: ${error.message}`));
    }

    // If canonical ID failed, try to find equivalent EFO/HP/OBA IDs
    if (allPgsIds.length === 0) {
      console.log(chalk.blue('  Searching for equivalent trait IDs...'));
      
      // Search for traits that might have this TRAIT ID in their mapped terms
      try {
        const searchResults = await pgsApiClient.searchTraits(trait.title);
        
        for (const result of searchResults.results || []) {
          if (result.trait_mapped_terms?.includes(traitId) || 
              result.ontology_trait_name === traitId) {
            console.log(chalk.blue(`  Found equivalent trait: ${result.id}`));
            
            const equivalentInfo = await pgsApiClient.getTraitInfo(result.id);
            if (equivalentInfo.associated_pgs_ids?.length > 0) {
              allPgsIds = equivalentInfo.associated_pgs_ids.filter(id => id.match(/^PGS[0-9]{6}$/));
              sourceId = result.id;
              traitTitle = equivalentInfo.label || trait.title;
              console.log(chalk.green(`  Using ${result.id} as source (${allPgsIds.length} PGS scores)`));
              break;
            }
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`  Equivalent trait search failed: ${error.message}`));
      }
    }

    // Fallback: try direct PGS score search
    if (allPgsIds.length === 0) {
      try {
        const directResults = await pgsApiClient.getScoresByTrait(traitId);
        if (directResults.results && directResults.results.length > 0) {
          console.log(
            chalk.blue(
              `  Found ${directResults.results.length} PGS scores via direct search`
            )
          );
          allPgsIds = directResults.results
            .map(score => score.id)
            .filter(id => id.match(/^PGS[0-9]{6}$/));
        }
      } catch (error) {
        console.log(chalk.yellow(`  Direct search failed: ${error.message}`));
      }
    }

    // Fallback: try trait search if direct search failed
    if (allPgsIds.length === 0) {
      console.log(chalk.yellow('  No direct results, trying trait search...'));
      const searchResults = await searchTraitTraits(trait.title);
      if (searchResults.length > 0) {
        // Try to get PGS IDs from the first matching trait
        const matchingTrait =
          searchResults.find(r => r.trait_id === traitId) || searchResults[0];
        try {
          const traitInfo = await pgsApiClient.getTraitInfo(
            matchingTrait.trait_id
          );
          allPgsIds = traitInfo.associated_pgs_ids || [];
        } catch (error) {
          console.log(
            chalk.yellow(`  Trait info lookup failed: ${error.message}`)
          );
        }
      }
    }

    // Filter out integrative PGS scores with detailed tracking
    const filteredPgsIds = [];
    const excludedPgsIds = [];
    const excludedPgsDetails = [];
    const filterResults = new Map();
    
    console.log(chalk.gray(`  Filtering ${allPgsIds.length} PGS scores...`));
    
    for (const pgsId of allPgsIds) {
      try {
        const scoreData = await pgsApiClient.getScore(pgsId);
        const filterResult = await shouldExcludePGS(pgsId, scoreData, pgsApiClient);
        
        filterResults.set(pgsId, filterResult);
        
        if (filterResult.exclude) {
          excludedPgsIds.push(pgsId);
          excludedPgsDetails.push({
            pgs_id: pgsId,
            reason: filterResult.reason,
            method: scoreData.method_name || 'Not specified',
            weight_type: scoreData.weight_type || 'Not specified'
          });
        } else {
          filteredPgsIds.push(pgsId);
        }
      } catch (error) {
        console.log(chalk.yellow(`    Warning: Could not validate ${pgsId}: ${error.message}`));
        filteredPgsIds.push(pgsId);
      }
    }
    
    if (excludedPgsIds.length > 0) {
      console.log(chalk.yellow(`  Excluded ${excludedPgsIds.length} integrative PGS: ${excludedPgsIds.join(', ')}`));
    }

    // Remove traits that have no PGS after filtering
    if (filteredPgsIds.length === 0) {
      console.log(chalk.red(`  ❌ Trait has no valid PGS scores after filtering - removing from catalog`));
      delete catalog.traits[traitId];
      await saveCatalog(catalog);
      continue;
    }

    console.log(chalk.gray(`  Processing ${filteredPgsIds.length} PGS scores...`));

    // Process filtered PGS IDs with normalization
    let totalVariants = 0;
    let uniqueVariants = 0;
    const pgsWithNorm = [];
    const seenIds = new Set();

    for (const pgsId of filteredPgsIds) {
      if (seenIds.has(pgsId)) continue;
      seenIds.add(pgsId);
      
      try {
        const data = await pgsApiClient.getScore(pgsId);
        const filterResult = filterResults.get(pgsId) || { performance_weight: 0.5, performance_metrics: null };
        
        if (data.variants_number) {
          totalVariants += data.variants_number;
          const estimatedUnique = Math.floor(data.variants_number * 0.7);
          uniqueVariants += estimatedUnique;
        }
        
        // Calculate normalization parameters
        const stats = await calculateWeightStats(pgsId, pgsApiClient);
        if (stats && stats.sd > 0) {
          // Check for incompatible scale
          const ratio = Math.abs(stats.mean / stats.sd);
          if (ratio > WEIGHT_THRESHOLDS.mean_sd_ratio) {
            excludedPgsIds.push(pgsId);
            excludedPgsDetails.push({
              pgs_id: pgsId,
              reason: `Incompatible scale: mean/std ratio = ${ratio.toFixed(1)}`,
              method: data.method_name || 'Not specified',
              weight_type: data.weight_type || 'Not specified'
            });
            console.log(chalk.yellow(`  ⚠ ${pgsId}: Excluded - Incompatible scale (ratio ${ratio.toFixed(1)})`));
            continue;
          }
          
          pgsWithNorm.push({ 
            id: pgsId, 
            norm_mean: stats.mean, 
            norm_sd: stats.sd,
            weight_type: data.weight_type,
            method: data.method_name,
            performance_weight: filterResult.performance_weight || 0.5,
            performance_metrics: filterResult.performance_metrics
          });
          console.log(chalk.green(`  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants (perf: ${(filterResult.performance_weight || 0.5).toFixed(2)})`));
        } else {
          pgsWithNorm.push({ 
            id: pgsId,
            weight_type: data.weight_type,
            method: data.method_name,
            performance_weight: filterResult.performance_weight || 0.5,
            performance_metrics: filterResult.performance_metrics
          });
          console.log(chalk.green(`  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants (perf: ${(filterResult.performance_weight || 0.5).toFixed(2)})`));
        }
      } catch (error) {
        pgsWithNorm.push({ id: pgsId });
        console.log(chalk.yellow(`  ⚠ ${pgsId}: ${error.message}`));
      }
    }
    
    // Check again after normalization filtering
    if (pgsWithNorm.length === 0) {
      console.log(chalk.red(`  ❌ Trait has no valid PGS scores after normalization - removing from catalog`));
      delete catalog.traits[traitId];
      await saveCatalog(catalog);
      continue;
    }
    
    trait.pgs_ids = pgsWithNorm;

    console.log(
      chalk.blue(
        `  Total variants: ${totalVariants.toLocaleString()} (estimated unique: ${uniqueVariants.toLocaleString()})`
      )
    );

    // Store both total and estimated unique for validation
    trait.expected_variants = totalVariants;
    trait.estimated_unique_variants = uniqueVariants;
    trait.title = traitTitle; // Update title from API
    
    // Store excluded PGS details for transparency
    if (excludedPgsDetails.length > 0) {
      trait.excluded_pgs = excludedPgsDetails;
    }
    
    // Add canonical URI
    const canonicalURI = generateCanonicalURI(traitId);
    if (canonicalURI) {
      trait.canonical_uri = canonicalURI;
    }

    // Update timestamp and save after each trait
    trait.last_updated = new Date().toISOString();
    await saveCatalog(catalog);
    console.log(chalk.green(`  ✓ Updated ${trait.title}`));
  }

  console.log(chalk.green('\n✓ Trait data refresh complete'));
}

async function addTrait() {
  console.log(chalk.cyan('\n=== Add New Trait ===\n'));

  const catalog = await loadCatalog();

  // Single input that handles both numbers and text search
  const { input } = await prompts({
    type: 'text',
    name: 'input',
    message: `Add trait - Enter one of:
  • TRAIT number: 1657, 5105
  • Full TRAIT ID: TRAIT:0001657
  • EFO ID: EFO_0000756
  • HP ID: HP_0000964
  • OBA ID: OBA_VT0001560, OBA_1000968
  • PATO ID: PATO_0000384
  • Comma-separated IDs: "1657,HP_0000964,PATO_0000384"
  • Search term: "diabetes", "cancer"
Input:`,
    validate: value => value.trim().length > 0 || 'Input cannot be empty'
  });

  if (!input) return;

  const trimmed = input.trim();

  // Check if input contains commas (multiple IDs)
  if (trimmed.includes(',')) {
    const ids = trimmed
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
    console.log(chalk.blue(`Processing ${ids.length} trait IDs...`));

    for (const id of ids) {
      console.log(chalk.cyan(`\n--- Processing: ${id} ---`));
      await processSingleTrait(id, catalog);
    }
    return;
  }

  // Single trait processing
  await processSingleTrait(trimmed, catalog);
}

async function processSingleTrait(input, catalog) {
  let selectedTrait = null;

  const parsed = parseTraitId(input);
  console.log(chalk.gray(`Parsed as ${parsed.type}: ${parsed.id}`));

  if (parsed.type === 'SEARCH') {
    // Handle as search term
    console.log(chalk.blue(`Searching for traits matching: ${input}`));
    const searchResults = await searchTraitTraits(input);

    if (searchResults.length === 0) {
      console.log(chalk.yellow('No TRAIT traits found for that search term'));
      return;
    }

    // Filter out existing traits
    const availableResults = searchResults.filter(
      trait => !catalog.traits[trait.trait_id]
    );

    if (availableResults.length === 0) {
      console.log(chalk.yellow('All found traits are already in the catalog'));
      return;
    }

    const choices = availableResults.map(trait => ({
      title: `${trait.title} (${trait.trait_id})`,
      description: `${trait.pgs_count} PGS scores available`,
      value: trait
    }));

    const { selected } = await prompts({
      type: 'select',
      name: 'selected',
      message: 'Select a trait to add:',
      choices
    });

    if (!selected) return;
    selectedTrait = {
      ...selected,
      canonical_id: selected.trait_id,
      source_id: selected.trait_id
    };
  } else {
    // Handle as ID lookup
    const canonicalId = parsed.id;

    if (catalog.traits[canonicalId]) {
      console.log(
        chalk.yellow(`Trait ${canonicalId} already exists in catalog`)
      );
      return;
    }

    console.log(chalk.blue(`Looking up ${parsed.id}...`));
    const traitInfo = await lookupTraitById(parsed.id);

    if (!traitInfo) {
      console.log(
        chalk.red(`Could not find trait information for ${parsed.id}`)
      );
      return;
    }

    // Check if canonical ID already exists
    if (
      traitInfo.canonical_id !== parsed.id &&
      catalog.traits[traitInfo.canonical_id]
    ) {
      const existing = catalog.traits[traitInfo.canonical_id];
      if (existing.pgs_ids.length === 0 || existing.expected_variants === 0) {
        console.log(
          chalk.yellow(
            `Trait ${traitInfo.canonical_id} exists but has incomplete data`
          )
        );
        const { update } = await prompts({
          type: 'confirm',
          name: 'update',
          message: 'Update with complete data?',
          initial: true
        });
        if (!update) return;
      } else {
        console.log(
          chalk.yellow(
            `Trait ${traitInfo.canonical_id} already exists with complete data`
          )
        );
        return;
      }
    }

    selectedTrait = traitInfo;
    
    // Display nice formatted entry
    console.log(chalk.green(`\n📋 Trait Found:`));
    console.log(chalk.bold(`   ${traitInfo.title}`));
    console.log(chalk.gray(`   ${traitInfo.description?.substring(0, 120)}...`));
    console.log(chalk.blue(`   📊 ${traitInfo.pgs_count} PGS scores available`));
    if (traitInfo.categories?.length > 0) {
      console.log(chalk.cyan(`   🏷️  Categories: ${traitInfo.categories.join(', ')}`));
    }
    console.log(chalk.gray(`   🔗 Canonical: ${traitInfo.canonical_id}`));
    if (traitInfo.source_id !== traitInfo.canonical_id) {
      console.log(chalk.gray(`   📡 Source: ${traitInfo.source_id}`));
    }
  }

  // Add the trait
  const canonicalId = selectedTrait.canonical_id;
  console.log(chalk.blue(`Adding ${selectedTrait.title} (${canonicalId})...`));

  // Collect trait description
  console.log(chalk.blue('Fetching trait description...'));
  const description = await collectTraitDescription(canonicalId);
  if (description) {
    console.log(chalk.green(`✓ Found description: ${description.substring(0, 80)}...`));
  } else {
    console.log(chalk.yellow('⚠ No description found'));
  }

  // Get PGS IDs for this trait
  let pgsIds = [];
  try {
    // Use the source ID (original) for fetching PGS scores
    const sourceId = selectedTrait.source_id || canonicalId;
    const traitInfo = await pgsApiClient.getTraitInfo(sourceId);
    pgsIds = (traitInfo.associated_pgs_ids || []).concat(
      traitInfo.child_associated_pgs_ids || []
    );
    // Remove duplicates
    pgsIds = [...new Set(pgsIds)];
    console.log(chalk.green(`Found ${pgsIds.length} PGS scores`));
  } catch (error) {
    console.log(chalk.yellow(`Could not fetch PGS scores: ${error.message}`));
  }

  // Calculate variant counts with improved filtering
  let totalVariants = 0;
  let uniqueVariants = 0;
  const pgsWithNorm = [];
  const excludedPgsIds = [];
  const excludedPgsDetails = [];
  const seenIds = new Set();
  const filterResults = new Map();

  if (pgsIds.length > 0) {
    console.log(chalk.blue('Filtering and calculating variant counts...'));
    for (const pgsId of pgsIds) {
      // Skip duplicates
      if (seenIds.has(pgsId)) {
        console.log(chalk.yellow(`  ⚠ ${pgsId}: Duplicate, skipping`));
        continue;
      }
      seenIds.add(pgsId);
      
      try {
        const data = await pgsApiClient.getScore(pgsId);
        const filterResult = await shouldExcludePGS(pgsId, data, pgsApiClient);
        
        filterResults.set(pgsId, filterResult);
        
        if (filterResult.exclude) {
          excludedPgsIds.push(pgsId);
          excludedPgsDetails.push({
            pgs_id: pgsId,
            reason: filterResult.reason,
            method: data.method_name || 'Not specified',
            weight_type: data.weight_type || 'Not specified'
          });
          console.log(chalk.yellow(`  ⚠ ${pgsId}: Excluded - ${filterResult.reason}`));
          continue;
        }
        
        if (data.variants_number) {
          totalVariants += data.variants_number;
          const estimatedUnique = Math.floor(data.variants_number * 0.7);
          uniqueVariants += estimatedUnique;
        }
        
        // Calculate normalization parameters
        const stats = await calculateWeightStats(pgsId, pgsApiClient);
        if (stats && stats.sd > 0) {
          // Check for incompatible scale
          const ratio = Math.abs(stats.mean / stats.sd);
          if (ratio > WEIGHT_THRESHOLDS.mean_sd_ratio) {
            excludedPgsIds.push(pgsId);
            excludedPgsDetails.push({
              pgs_id: pgsId,
              reason: `Incompatible scale: mean/std ratio = ${ratio.toFixed(1)}`,
              method: data.method_name || 'Not specified',
              weight_type: data.weight_type || 'Not specified'
            });
            console.log(chalk.yellow(`  ⚠ ${pgsId}: Excluded - Incompatible scale (ratio ${ratio.toFixed(1)})`));
            continue;
          }
          
          pgsWithNorm.push({ 
            id: pgsId, 
            norm_mean: stats.mean, 
            norm_sd: stats.sd,
            weight_type: data.weight_type,
            method: data.method_name,
            performance_weight: filterResult.performance_weight || 0.5,
            performance_metrics: filterResult.performance_metrics
          });
          console.log(chalk.green(`  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants (perf: ${(filterResult.performance_weight || 0.5).toFixed(2)})`));
        } else {
          pgsWithNorm.push({ 
            id: pgsId,
            weight_type: data.weight_type,
            method: data.method_name,
            performance_weight: filterResult.performance_weight || 0.5,
            performance_metrics: filterResult.performance_metrics
          });
          console.log(chalk.green(`  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants (perf: ${(filterResult.performance_weight || 0.5).toFixed(2)})`));
        }
      } catch (error) {
        console.log(chalk.yellow(`  ⚠ ${pgsId}: ${error.message}`));
        pgsWithNorm.push({ id: pgsId });
      }
    }
    
    if (excludedPgsIds.length > 0) {
      console.log(chalk.yellow(`Excluded ${excludedPgsIds.length} integrative PGS: ${excludedPgsIds.join(', ')}`));
    }
    
    console.log(
      chalk.blue(
        `Total variants: ${totalVariants.toLocaleString()} (estimated unique: ${uniqueVariants.toLocaleString()})`
      )
    );
  }

  // Don't add traits with no valid PGS scores
  if (pgsWithNorm.length === 0) {
    console.log(chalk.red(`❌ Trait has no valid PGS scores after filtering - not adding to catalog`));
    if (excludedPgsIds.length > 0) {
      console.log(chalk.yellow(`   All ${excludedPgsIds.length} PGS scores were integrative/meta`));
    }
    return;
  }

  const traitData = {
    title: selectedTrait.title,
    trait_id: canonicalId,
    pgs_ids: pgsWithNorm,
    last_updated: new Date().toISOString(),
    expected_variants: totalVariants,
    estimated_unique_variants: uniqueVariants
  };

  // Add description if found
  if (description) {
    traitData.description = description;
  }
  
  // Store excluded PGS details for transparency
  if (excludedPgsDetails.length > 0) {
    traitData.excluded_pgs = excludedPgsDetails;
  }
  
  // Add canonical URI
  const canonicalURI = generateCanonicalURI(canonicalId);
  if (canonicalURI) {
    traitData.canonical_uri = canonicalURI;
  }

  catalog.traits[canonicalId] = traitData;

  await saveCatalog(catalog);
  console.log(
    chalk.green(`\n✓ Added trait: ${selectedTrait.title} (${canonicalId})`)
  );
  console.log(
    chalk.blue(
      `   ${pgsWithNorm.length} PGS scores (${excludedPgsIds.length} excluded), ${totalVariants.toLocaleString()} total variants`
    )
  );
}

async function listTraits() {
  const catalog = await loadCatalog();

  console.log(chalk.cyan('\n=== Current Traits ===\n'));

  if (Object.keys(catalog.traits).length === 0) {
    console.log(chalk.yellow('No traits in catalog'));
    return;
  }

  Object.entries(catalog.traits).forEach(([traitId, trait]) => {
    console.log(chalk.bold.blue(`${trait.title} (${traitId})`));
    if (trait.pgs_ids.length > 0) {
      console.log(`   ${chalk.green('PGS IDs:')} ${trait.pgs_ids.join(', ')}`);
    } else {
      console.log(`   ${chalk.yellow('No PGS scores assigned')}`);
    }
    console.log();
  });
}

async function freshStart() {
  const freshCatalog = { traits: {} };
  await saveCatalog(freshCatalog);
  console.log(chalk.green('✓ Catalog reset to empty state'));
}

async function importFromFile() {
  console.log(chalk.cyan('\n=== Import Traits from File ===\n'));

  const catalog = await loadCatalog();

  const { filePath } = await prompts({
    type: 'text',
    name: 'filePath',
    message: 'Enter file path (relative to pipeline directory):',
    initial: 'import_ids.csv',
    validate: value => value.trim().length > 0 || 'File path cannot be empty'
  });

  if (!filePath) return;

  try {
    const fullPath = path.resolve(__dirname, filePath.trim());
    const fileContent = await fs.readFile(fullPath, 'utf8');

    // Parse CSV - handle both comma-separated single line and multi-line
    const ids = fileContent
      .split(/[,\n\r]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    console.log(chalk.blue(`Found ${ids.length} trait IDs in file`));

    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Process ${ids.length} trait IDs?`,
      initial: true
    });

    if (!confirm) return;

    let processed = 0;
    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const id of ids) {
      processed++;
      console.log(
        chalk.cyan(`\n[${processed}/${ids.length}] Processing: ${id}`)
      );

      try {
        const beforeCount = Object.keys(catalog.traits).length;
        await processSingleTrait(id, catalog);
        const afterCount = Object.keys(catalog.traits).length;

        if (afterCount > beforeCount) {
          added++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.log(chalk.red(`  Error processing ${id}: ${error.message}`));
        errors++;
      }
    }

    console.log(chalk.green('\n✓ Import complete:'));
    console.log(chalk.blue(`  Processed: ${processed}`));
    console.log(chalk.green(`  Added: ${added}`));
    console.log(chalk.yellow(`  Skipped: ${skipped}`));
    console.log(chalk.red(`  Errors: ${errors}`));
  } catch (error) {
    console.log(chalk.red(`Error reading file: ${error.message}`));
  }
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  // Handle command-line arguments
  if (command === 'analyze' && arg) {
    await analyzeTraitQuality(arg);
    return;
  }
  
  if (command === 'refresh') {
    await refreshTraitData();
    return;
  }
  
  if (command === 'list') {
    await listTraits();
    return;
  }
  
  if (command === 'add' && arg) {
    const catalog = await loadCatalog();
    await processSingleTrait(arg, catalog);
    return;
  }
  
  // Interactive mode
  console.log(chalk.bold.blue('\n🧬 Asili Trait Manager\n'));

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: '📋 List current traits', value: 'list' },
      { title: '➕ Add trait to family', value: 'add' },
      { title: '📁 Import traits from file', value: 'import' },
      { title: '🔄 Refresh trait data', value: 'refresh' },
      { title: '🔬 Analyze trait quality', value: 'analyze' },
      { title: '🆕 Fresh start', value: 'fresh' },
      { title: '🚪 Exit', value: 'exit' }
    ]
  });

  switch (action) {
    case 'list':
      await listTraits();
      break;
    case 'add':
      await addTrait();
      break;
    case 'import':
      await importFromFile();
      break;
    case 'refresh':
      await refreshTraitData();
      break;
    case 'analyze': {
      const { traitId } = await prompts({
        type: 'text',
        name: 'traitId',
        message: 'Enter trait ID to analyze (e.g., MONDO:0005575):',
        validate: value => value.trim().length > 0 || 'Trait ID cannot be empty'
      });
      if (traitId) {
        await analyzeTraitQuality(traitId);
      }
      break;
    }
    case 'fresh':
      await freshStart();
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
