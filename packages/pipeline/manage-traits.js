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
    
    if (Object.keys(catalog.trait_families).length === 0) {
        console.log(chalk.yellow('No trait families to refresh'));
        return;
    }
    
    console.log(chalk.blue('Refreshing and expanding PGS data from catalog...'));
    
    for (const [familyKey, family] of Object.entries(catalog.trait_families)) {
        console.log(chalk.gray(`Processing ${family.name}...`));
        
        // Refresh subtypes
        for (const [subtypeKey, subtype] of Object.entries(family.subtypes || {})) {
            console.log(chalk.gray(`  Refreshing ${subtype.name}...`));
            
            // Search for additional PGS scores for this trait
            const searchResults = await searchPGS(subtype.name);
            const existingIds = new Set(subtype.pgs_ids);
            const newIds = [];
            
            // Find new PGS IDs not already in the list, matching by EFO ID if available
            for (const result of searchResults) {
                if (!existingIds.has(result.id)) {
                    // If we have EFO IDs, only add PGS scores from the same trait
                    if (subtype.trait_efo_id && result.trait_efo && subtype.trait_efo_id !== result.trait_efo) {
                        continue; // Skip PGS scores from different traits
                    }
                    newIds.push(result.id);
                }
            }
            
            if (newIds.length > 0) {
                console.log(chalk.blue(`    Found ${newIds.length} additional PGS scores: ${newIds.join(', ')}`));
                subtype.pgs_ids = [...subtype.pgs_ids, ...newIds];
            }
            
            // Update variant counts for all PGS IDs - but don't store in canonical
            let totalVariants = 0;
            for (const pgsId of subtype.pgs_ids) {
                try {
                    const data = await pgsApiClient.getScore(pgsId);
                    if (data.variants_number) {
                        totalVariants += data.variants_number;
                    }
                    console.log(chalk.green(`    ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants`));
                } catch (error) {
                    console.log(chalk.yellow(`    ⚠ ${pgsId}: ${error.message}`));
                }
            }
            
            console.log(chalk.blue(`    Total variants: ${totalVariants.toLocaleString()}`));
        }
        
        // Refresh biomarkers
        for (const [biomarkerKey, biomarker] of Object.entries(family.biomarkers || {})) {
            console.log(chalk.gray(`  Refreshing ${biomarker.name}...`));
            
            // Search for additional PGS scores for this biomarker
            const searchResults = await searchPGS(biomarker.name);
            const existingIds = new Set(biomarker.pgs_ids);
            const newIds = [];
            
            for (const result of searchResults) {
                if (!existingIds.has(result.id)) {
                    // If we have EFO IDs, only add PGS scores from the same trait
                    if (biomarker.trait_efo_id && result.trait_efo && biomarker.trait_efo_id !== result.trait_efo) {
                        continue; // Skip PGS scores from different traits
                    }
                    newIds.push(result.id);
                }
            }
            
            if (newIds.length > 0) {
                console.log(chalk.blue(`    Found ${newIds.length} additional PGS scores: ${newIds.join(', ')}`));
                biomarker.pgs_ids = [...biomarker.pgs_ids, ...newIds];
            }
            
            let totalVariants = 0;
            for (const pgsId of biomarker.pgs_ids) {
                try {
                    const data = await pgsApiClient.getScore(pgsId);
                    if (data.variants_number) {
                        totalVariants += data.variants_number;
                    }
                    console.log(chalk.green(`    ✓ ${pgsId}: ${data.variants_number?.toLocaleString()} variants`));
                } catch (error) {
                    console.log(chalk.yellow(`    ⚠ ${pgsId}: ${error.message}`));
                }
            }
            
            console.log(chalk.blue(`    Total variants: ${totalVariants.toLocaleString()}`));
        }
    }
    
    await saveCatalog(catalog);
    console.log(chalk.green('\n✓ Trait data refreshed and expanded from PGS Catalog'));
}

async function addTraitFamily() {
    console.log(chalk.cyan('\n=== Add Trait to Family ===\n'));
    
    const catalog = await loadCatalog();
    
    // Select family
    const familyChoices = Object.entries(catalog.trait_families).map(([key, family]) => ({
        title: family.name,
        value: key
    }));
    
    const { familyKey } = await prompts({
        type: 'select',
        name: 'familyKey',
        message: 'Select trait family:',
        choices: familyChoices
    });
    
    if (!familyKey) return;
    
    // Select subtype or biomarker
    const { itemType } = await prompts({
        type: 'select',
        name: 'itemType',
        message: 'Add to:',
        choices: [
            { title: 'Subtype (main risk factor)', value: 'subtype' },
            { title: 'Biomarker (supporting measurement)', value: 'biomarker' }
        ]
    });
    
    if (!itemType) return;
    
    // Search for PGS scores
    const { searchQuery } = await prompts({
        type: 'text',
        name: 'searchQuery',
        message: 'Search for trait (e.g., "diabetes", "alzheimer"):',
        validate: value => value.length > 2 || 'Please enter at least 3 characters'
    });
    
    const results = await searchPGS(searchQuery);
    
    if (results.length === 0) {
        console.log(chalk.yellow('No results found. Try a different search term.'));
        return;
    }
    
    // Select multiple PGS scores
    const choices = results.map((result, index) => ({
        title: `${chalk.bold(result.name)} (${result.id})`,
        description: `${result.variant_count?.toLocaleString() || 'Unknown'} variants | ${result.description?.substring(0, 80) || 'No description'}`,
        value: result.id,
        selected: false
    }));
    
    if (choices.length === 0) {
        console.log(chalk.yellow('No PGS scores found for selection.'));
        return;
    }
    
    console.log(chalk.cyan(`\nFound ${choices.length} PGS scores:`));
    choices.forEach((choice, i) => {
        console.log(`${i + 1}. ${choice.title}`);
        console.log(`   ${chalk.gray(choice.description)}`);
    });
    
    // Add "Select All" option
    const { selectAll } = await prompts({
        type: 'confirm',
        name: 'selectAll',
        message: `Select all ${choices.length} PGS scores for this trait?`,
        initial: false
    });
    
    let selectedPgsIds;
    if (selectAll) {
        selectedPgsIds = choices.map(c => c.value);
        console.log(chalk.green(`Selected all ${selectedPgsIds.length} PGS scores`));
    } else {
        const selection = await prompts({
            type: 'multiselect',
            name: 'selectedPgsIds',
            message: 'Select specific PGS scores (space to select, enter to confirm):',
            choices,
            hint: '- Space to select. Return to submit'
        });
        selectedPgsIds = selection.selectedPgsIds;
    }
    
    if (!selectedPgsIds || selectedPgsIds.length === 0) return;
    
    // Use metadata from first result to auto-populate fields
    const firstResult = results.find(r => selectedPgsIds.includes(r.id));
    const traitName = firstResult.name;
    const traitDescription = firstResult.description;
    
    // Calculate total variant count from selected PGS scores
    const selectedResults = results.filter(r => selectedPgsIds.includes(r.id));
    const totalVariants = selectedResults.reduce((sum, result) => sum + (result.variant_count || 0), 0);
    
    // Generate key from trait name
    const suggestedKey = traitName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    
    console.log(chalk.cyan(`\nAuto-detected trait: ${chalk.bold(traitName)}`));
    console.log(chalk.gray(`Description: ${traitDescription}`));
    console.log(chalk.gray(`Suggested key: ${suggestedKey}`));
    
    // Check for key collision
    const targetSection = itemType === 'subtype' ? 'subtypes' : 'biomarkers';
    const existingKeys = Object.keys(catalog.trait_families[familyKey][targetSection] || {});
    
    let finalKey = suggestedKey;
    if (existingKeys.includes(suggestedKey)) {
        console.log(chalk.yellow(`\n⚠ Key collision detected: '${suggestedKey}' already exists`));
        const { customKey } = await prompts({
            type: 'text',
            name: 'customKey',
            message: 'Enter a different key:',
            initial: `${suggestedKey}_2`,
            validate: value => {
                if (existingKeys.includes(value)) return 'Key already exists';
                if (!/^[a-z_]+$/.test(value)) return 'Use lowercase letters and underscores only';
                return true;
            }
        });
        if (!customKey) return;
        finalKey = customKey;
    }
    
    // Confirm the auto-detected information
    const { confirmed } = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: `Add '${traitName}' with ${selectedPgsIds.length} PGS scores?`,
        initial: true
    });
    
    if (!confirmed) return;
    
    // Add to catalog
    if (!catalog.trait_families[familyKey][targetSection]) {
        catalog.trait_families[familyKey][targetSection] = {};
    }
    
    const newItem = {
        name: traitName,
        pgs_ids: selectedPgsIds,
        description: traitDescription
    };
    
    // Default weight for subtypes
    if (itemType === 'subtype') {
        newItem.weight = 1.0;
    }
    
    catalog.trait_families[familyKey][targetSection][finalKey] = newItem;
    
    await saveCatalog(catalog);
    
    console.log(chalk.green(`\n✓ Added ${itemType}: ${traitName}`));
    console.log(chalk.gray(`  Key: ${finalKey}`));
    console.log(chalk.gray(`  PGS IDs: ${selectedPgsIds.join(', ')}`));
    console.log(chalk.gray(`  Description: ${traitDescription}`));
    console.log(chalk.gray(`  Variant count: ${totalVariants.toLocaleString()}`));
}

async function listTraits() {
    const catalog = await loadCatalog();
    
    console.log(chalk.cyan('\n=== Current Trait Families ===\n'));
    
    if (Object.keys(catalog.trait_families).length === 0) {
        console.log(chalk.yellow('No trait families in catalog'));
        return;
    }

    Object.entries(catalog.trait_families).forEach(([familyName, familyData]) => {
        console.log(chalk.bold.blue(`${familyData.name} (${familyName})`));
        console.log(`   ${chalk.gray(familyData.description)}`);
        
        // Show subtypes
        Object.entries(familyData.subtypes || {}).forEach(([subtypeName, subtypeData]) => {
            console.log(`   ${chalk.green('▸')} ${subtypeData.name} ${chalk.gray(`(${subtypeData.pgs_ids.join(', ')})`)}`);
            if (subtypeData.variant_count) {
                console.log(`     ${chalk.blue(subtypeData.variant_count.toLocaleString())} variants`);
            }
        });
        
        // Show biomarkers if present
        if (familyData.biomarkers) {
            Object.entries(familyData.biomarkers).forEach(([biomarkerName, biomarkerData]) => {
                console.log(`   ${chalk.yellow('◦')} ${biomarkerData.name} ${chalk.gray(`(${biomarkerData.pgs_ids.join(', ')})`)}`);
            });
        }
        
        console.log();
    });
}

async function freshStart() {
    const freshCatalog = { trait_families: {} };
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
            await addTraitFamily();
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
