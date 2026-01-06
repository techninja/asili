import chalk from 'chalk';
import prompts from 'prompts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pgsApiClient from './pgs-api-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'trait_catalog.json');
const SCHEMA_PATH = path.join(__dirname, 'trait-catalog-schema.json');

// Initialize JSON schema validator
const ajv = new Ajv();
addFormats(ajv);
let catalogSchema;

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
  MONDO_NUMBER: {
    regex: /^[0-9]+$/,
    format: id => `MONDO:${id.padStart(7, '0')}`
  },
  MONDO_FULL: { regex: /^MONDO:[0-9]{7}$/, format: id => id },
  MONDO_UNDERSCORE: {
    regex: /^MONDO_[0-9]{7}$/,
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
    const traitInfo = await pgsApiClient.getTraitInfo(traitId);

    // Determine canonical ID (prefer MONDO if available)
    let canonicalId = traitId;
    if (traitId.startsWith('EFO_') && traitInfo.trait_mapped_terms) {
      const mondoTerm = traitInfo.trait_mapped_terms.find(term =>
        term.startsWith('MONDO:')
      );
      if (mondoTerm) {
        canonicalId = mondoTerm;
        console.log(chalk.blue(`  Found MONDO equivalent: ${mondoTerm}`));
      }
    }

    return {
      canonical_id: canonicalId,
      source_id: traitId,
      title: traitInfo.label || 'Unknown trait',
      description: traitInfo.description || '',
      pgs_count:
        (traitInfo.associated_pgs_ids?.length || 0) +
        (traitInfo.child_associated_pgs_ids?.length || 0)
    };
  } catch (error) {
    return null;
  }
}

async function searchMondoTraits(query) {
  console.log(chalk.blue(`Searching MONDO traits for: ${query}`));

  try {
    const traitData = await pgsApiClient.searchTraits(query);
    const results = [];

    for (const trait of traitData.results.slice(0, 10)) {
      if (
        trait.ontology_trait_name &&
        trait.ontology_trait_name.startsWith('MONDO:')
      ) {
        const pgsCount =
          (trait.associated_pgs_ids || []).length +
          (trait.child_associated_pgs_ids || []).length;
        results.push({
          mondo_id: trait.ontology_trait_name,
          title: trait.label,
          description: trait.description || '',
          pgs_count: pgsCount
        });
      }
    }

    return results;
  } catch (error) {
    console.log(chalk.red('Error searching MONDO traits:', error.message));
    return [];
  }
}

async function refreshTraitData() {
  console.log(chalk.cyan('\n=== Refresh Trait Data ===\n'));

  const catalog = await loadCatalog();

  if (Object.keys(catalog.traits).length === 0) {
    console.log(chalk.yellow('No traits to refresh'));
    return;
  }

  // Check for --fresh flag
  const fresh = process.argv.includes('--fresh');
  if (fresh) {
    console.log(chalk.yellow('Fresh mode: ignoring last_updated dates'));
  }

  console.log(chalk.blue('Refreshing PGS data for MONDO traits...'));

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  for (const [mondoId, trait] of Object.entries(catalog.traits)) {
    // Ensure internal mondo_id matches the key (key is authoritative)
    trait.mondo_id = mondoId;

    // Skip if updated within last month AND has PGS IDs (unless fresh mode)
    if (!fresh && trait.last_updated && trait.pgs_ids.length > 0) {
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

    console.log(chalk.gray(`Processing ${trait.title} (${mondoId})...`));

    // Use direct trait info API to get associated PGS IDs
    let allPgsIds = [];
    let traitTitle = trait.title; // Keep existing title as fallback

    try {
      const traitInfo = await pgsApiClient.getTraitInfo(mondoId);
      if (
        traitInfo.associated_pgs_ids &&
        traitInfo.associated_pgs_ids.length > 0
      ) {
        console.log(
          chalk.blue(
            `  Found ${traitInfo.associated_pgs_ids.length} PGS scores via trait info API`
          )
        );
        allPgsIds = traitInfo.associated_pgs_ids.filter(id =>
          id.match(/^PGS[0-9]{6}$/)
        );

        // Update title from API if available
        if (traitInfo.label && traitInfo.label.trim()) {
          traitTitle = traitInfo.label.trim();
          console.log(chalk.green(`  Updated title: ${traitTitle}`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`  Trait info API failed: ${error.message}`));
    }

    // Fallback: try direct PGS score search
    if (allPgsIds.length === 0) {
      try {
        const directResults = await pgsApiClient.getScoresByTrait(mondoId);
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
      const searchResults = await searchMondoTraits(trait.title);
      if (searchResults.length > 0) {
        // Try to get PGS IDs from the first matching trait
        const matchingTrait =
          searchResults.find(r => r.mondo_id === mondoId) || searchResults[0];
        try {
          const traitInfo = await pgsApiClient.getTraitInfo(
            matchingTrait.mondo_id
          );
          allPgsIds = traitInfo.associated_pgs_ids || [];
        } catch (error) {
          console.log(
            chalk.yellow(`  Trait info lookup failed: ${error.message}`)
          );
        }
      }
    }

    // Compare with existing IDs
    const existingIds = new Set(trait.pgs_ids);
    const newIds = allPgsIds.filter(id => !existingIds.has(id));

    if (newIds.length > 0) {
      console.log(chalk.blue(`  Found ${newIds.length} additional PGS scores`));
      trait.pgs_ids = [...trait.pgs_ids, ...newIds];
    } else if (allPgsIds.length > 0) {
      console.log(
        chalk.blue(`  Confirmed ${allPgsIds.length} existing PGS scores`)
      );
      // Update the list to match what the API returns (in case some were removed)
      trait.pgs_ids = allPgsIds;
    }

    // Validate existing PGS IDs and calculate unique variant count
    let totalVariants = 0;
    let uniqueVariants = 0;
    const variantSet = new Set();

    for (const pgsId of trait.pgs_ids) {
      try {
        const data = await pgsApiClient.getScore(pgsId);
        if (data.variants_number) {
          totalVariants += data.variants_number;

          // For unique count estimation, we'd need to actually process the files
          // For now, use a rough estimate based on typical overlap patterns
          const estimatedUnique = Math.floor(data.variants_number * 0.7); // Assume 30% overlap
          uniqueVariants += estimatedUnique;
        }
        console.log(
          chalk.green(
            `  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants`
          )
        );
      } catch (error) {
        console.log(chalk.yellow(`  ⚠ ${pgsId}: ${error.message}`));
      }
    }

    console.log(
      chalk.blue(
        `  Total variants: ${totalVariants.toLocaleString()} (estimated unique: ${uniqueVariants.toLocaleString()})`
      )
    );

    // Store both total and estimated unique for validation
    trait.expected_variants = totalVariants;
    trait.estimated_unique_variants = uniqueVariants;
    trait.title = traitTitle; // Update title from API

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
  • MONDO number: 1657, 5105
  • Full MONDO ID: MONDO:0001657
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
    const searchResults = await searchMondoTraits(input);

    if (searchResults.length === 0) {
      console.log(chalk.yellow('No MONDO traits found for that search term'));
      return;
    }

    // Filter out existing traits
    const availableResults = searchResults.filter(
      trait => !catalog.traits[trait.mondo_id]
    );

    if (availableResults.length === 0) {
      console.log(chalk.yellow('All found traits are already in the catalog'));
      return;
    }

    const choices = availableResults.map(trait => ({
      title: `${trait.title} (${trait.mondo_id})`,
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
      canonical_id: selected.mondo_id,
      source_id: selected.mondo_id
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
    console.log(
      chalk.green(
        `Found: ${traitInfo.title} (${traitInfo.pgs_count} PGS scores)`
      )
    );
  }

  // Add the trait
  const canonicalId = selectedTrait.canonical_id;
  console.log(chalk.blue(`Adding ${selectedTrait.title} (${canonicalId})...`));

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

  // Calculate variant counts
  let totalVariants = 0;
  let uniqueVariants = 0;

  if (pgsIds.length > 0) {
    console.log(chalk.blue('Calculating variant counts...'));
    for (const pgsId of pgsIds) {
      try {
        const data = await pgsApiClient.getScore(pgsId);
        if (data.variants_number) {
          totalVariants += data.variants_number;
          const estimatedUnique = Math.floor(data.variants_number * 0.7);
          uniqueVariants += estimatedUnique;
        }
        console.log(
          chalk.green(
            `  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants`
          )
        );
      } catch (error) {
        console.log(chalk.yellow(`  ⚠ ${pgsId}: ${error.message}`));
      }
    }
    console.log(
      chalk.blue(
        `Total variants: ${totalVariants.toLocaleString()} (estimated unique: ${uniqueVariants.toLocaleString()})`
      )
    );
  }

  catalog.traits[canonicalId] = {
    title: selectedTrait.title,
    mondo_id: canonicalId,
    pgs_ids: pgsIds,
    last_updated: new Date().toISOString(),
    expected_variants: totalVariants,
    estimated_unique_variants: uniqueVariants
  };

  await saveCatalog(catalog);
  console.log(
    chalk.green(`\n✓ Added trait: ${selectedTrait.title} (${canonicalId})`)
  );
  console.log(
    chalk.blue(
      `   ${pgsIds.length} PGS scores, ${totalVariants.toLocaleString()} total variants`
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

  Object.entries(catalog.traits).forEach(([mondoId, trait]) => {
    console.log(chalk.bold.blue(`${trait.title} (${mondoId})`));
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
    case 'fresh':
      await freshStart();
      break;
    case 'exit':
      console.log(chalk.gray('Goodbye!'));
      return;
  }

  // Ask if they want to continue
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
