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
            console.log(chalk.yellow('No existing catalog found, creating new one...'));
            return { trait_families: {} };
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

async function searchPGS(query) {
    console.log(chalk.blue(`Searching PGS Catalog for: ${query}`));
    
    try {
        const traitData = await pgsApiClient.searchTraits(query);
        const results = [];
        
        // Get PGS scores for each trait
        for (const trait of traitData.results.slice(0, 3)) { // Limit to 3 traits
            console.log(chalk.gray(`  Found trait: ${trait.label}`));
            const pgsIds = trait.associated_pgs_ids.concat(trait.child_associated_pgs_ids || []);
            
            for (const pgsId of pgsIds.slice(0, 10)) { // Limit to 10 PGS per trait
                try {
                    const scoreData = await pgsApiClient.getScore(pgsId);
                    results.push({
                        id: scoreData.id,
                        name: trait.label,
                        description: trait.description || scoreData.trait_reported || 'No description available',
                        variant_count: scoreData.variants_number,
                        samples_ancestry: scoreData.samples_ancestry,
                        publication: scoreData.publication?.title,
                        ftp_scoring_file: scoreData.ftp_scoring_file,
                        trait_efo: trait.efo_id,
                        trait_ontology: trait.ontology_trait_name,
                        scoreData: scoreData // Keep full score data for later use
                    });
                    console.log(chalk.green(`    ✓ ${pgsId}: ${scoreData.variants_number?.toLocaleString()} variants`));
                } catch (error) {
                    console.log(chalk.yellow(`    ⚠ Skipping ${pgsId}: ${error.message}`));
                }
            }
        }
        
        console.log(chalk.blue(`Found ${results.length} total PGS scores`));
        return results;
    } catch (error) {
        console.log(chalk.red('Error searching PGS Catalog:', error.message));
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
                console.log(chalk.gray(`Skipping ${trait.title} (updated ${lastUpdate.toDateString()})`));
                continue;
            }
        }
        
        console.log(chalk.gray(`Processing ${trait.title} (${mondoId})...`));
        
        // Use direct trait info API to get associated PGS IDs
        let allPgsIds = [];
        let traitTitle = trait.title; // Keep existing title as fallback
        
        try {
            const traitInfo = await pgsApiClient.getTraitInfo(mondoId);
            if (traitInfo.associated_pgs_ids && traitInfo.associated_pgs_ids.length > 0) {
                console.log(chalk.blue(`  Found ${traitInfo.associated_pgs_ids.length} PGS scores via trait info API`));
                allPgsIds = traitInfo.associated_pgs_ids.filter(id => id.match(/^PGS[0-9]{6}$/));
                
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
                    console.log(chalk.blue(`  Found ${directResults.results.length} PGS scores via direct search`));
                    allPgsIds = directResults.results.map(score => score.id).filter(id => id.match(/^PGS[0-9]{6}$/));
                }
            } catch (error) {
                console.log(chalk.yellow(`  Direct search failed: ${error.message}`));
            }
        }
        
        // Fallback: try trait search if direct search failed
        if (allPgsIds.length === 0) {
            console.log(chalk.yellow(`  No direct results, trying trait search...`));
            const titleResults = await searchPGS(trait.title);
            allPgsIds = titleResults.map(r => r.id).filter(id => id && id.match(/^PGS[0-9]{6}$/));
        }
        
        // Compare with existing IDs
        const existingIds = new Set(trait.pgs_ids);
        const newIds = allPgsIds.filter(id => !existingIds.has(id));
        
        if (newIds.length > 0) {
            console.log(chalk.blue(`  Found ${newIds.length} additional PGS scores`));
            trait.pgs_ids = [...trait.pgs_ids, ...newIds];
        } else if (allPgsIds.length > 0) {
            console.log(chalk.blue(`  Confirmed ${allPgsIds.length} existing PGS scores`));
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
                console.log(chalk.green(`  ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants`));
            } catch (error) {
                console.log(chalk.yellow(`  ⚠ ${pgsId}: ${error.message}`));
            }
        }
        
        console.log(chalk.blue(`  Total variants: ${totalVariants.toLocaleString()} (estimated unique: ${uniqueVariants.toLocaleString()})`));
        
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
    
    // Get MONDO ID from user
    const { mondoId } = await prompts({
        type: 'text',
        name: 'mondoId',
        message: 'Enter MONDO ID (e.g., MONDO:0005015):',
        validate: value => {
            if (!/^MONDO:[0-9]{7}$/.test(value)) {
                return 'Please enter a valid MONDO ID format (MONDO:0000000)';
            }
            if (catalog.traits[value]) {
                return 'This MONDO ID already exists in the catalog';
            }
            return true;
        }
    });
    
    if (!mondoId) return;
    
    // Get trait title
    const { title } = await prompts({
        type: 'text',
        name: 'title',
        message: 'Enter trait title:',
        validate: value => value.length > 0 || 'Title cannot be empty'
    });
    
    if (!title) return;
    
    // Search for PGS scores
    const results = await searchPGS(title);
    
    if (results.length === 0) {
        console.log(chalk.yellow('No PGS scores found. Adding trait with empty PGS list.'));
        catalog.traits[mondoId] = {
            title,
            mondo_id: mondoId,
            pgs_ids: [],
            last_updated: new Date().toISOString()
        };
    } else {
        // Select PGS scores
        const choices = results.map(result => ({
            title: `${result.name} (${result.id})`,
            description: `${result.variant_count?.toLocaleString() || 'Unknown'} variants`,
            value: result.id
        }));
        
        const { selectAll } = await prompts({
            type: 'confirm',
            name: 'selectAll',
            message: `Select all ${choices.length} PGS scores?`,
            initial: true
        });
        
        let selectedPgsIds;
        if (selectAll) {
            selectedPgsIds = choices.map(c => c.value);
        } else {
            const selection = await prompts({
                type: 'multiselect',
                name: 'selectedPgsIds',
                message: 'Select PGS scores:',
                choices
            });
            selectedPgsIds = selection.selectedPgsIds || [];
        }
        
        catalog.traits[mondoId] = {
            title,
            mondo_id: mondoId,
            pgs_ids: selectedPgsIds,
            last_updated: new Date().toISOString()
        };
    }
    
    await saveCatalog(catalog);
    console.log(chalk.green(`\n✓ Added trait: ${title} (${mondoId})`));
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

async function main() {
    console.log(chalk.bold.blue('\n🧬 Asili Trait Manager\n'));

    const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
            { title: '📋 List current traits', value: 'list' },
            { title: '➕ Add trait to family', value: 'add' },
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
