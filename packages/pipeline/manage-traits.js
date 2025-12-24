import chalk from 'chalk';
import prompts from 'prompts';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'trait_catalog.json');

async function loadCatalog() {
    try {
        const data = await fs.readFile(CATALOG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log(chalk.yellow('No existing catalog found, creating new one...'));
        return { trait_families: {} };
    }
}

async function saveCatalog(catalog) {
    await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log(chalk.green('✓ Catalog saved'));
}

async function searchPGS(query) {
    console.log(chalk.blue(`Searching PGS Catalog for: ${query}`));
    
    try {
        // First search for traits
        const traitResponse = await fetch(`https://www.pgscatalog.org/rest/trait/search?term=${encodeURIComponent(query)}&exact=0&include_children=1`, {
            headers: { 'accept': 'application/json' }
        });
        
        if (!traitResponse.ok) {
            throw new Error(`HTTP ${traitResponse.status}`);
        }
        
        const traitData = await traitResponse.json();
        const results = [];
        
        // Get PGS scores for each trait
        for (const trait of traitData.results.slice(0, 5)) { // Limit to 5 traits
            const pgsIds = trait.associated_pgs_ids.concat(trait.child_associated_pgs_ids || []);
            
            for (const pgsId of pgsIds.slice(0, 3)) { // Limit to 3 PGS per trait
                try {
                    const scoreResponse = await fetch(`https://www.pgscatalog.org/rest/score/${pgsId}`, {
                        headers: { 'accept': 'application/json' }
                    });
                    
                    if (scoreResponse.ok) {
                        const scoreData = await scoreResponse.json();
                        results.push({
                            id: scoreData.id,
                            name: trait.label,
                            description: trait.description,
                            variant_count: scoreData.variants_number,
                            samples_ancestry: scoreData.samples_ancestry,
                            publication: scoreData.publication?.title,
                            ftp_scoring_file: scoreData.ftp_scoring_file
                        });
                    }
                } catch (error) {
                    console.log(chalk.yellow(`Skipping ${pgsId}: ${error.message}`));
                }
            }
        }
        
        return results;
    } catch (error) {
        console.log(chalk.red('Error searching PGS Catalog:', error.message));
        return [];
    }
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
    const choices = results.slice(0, 10).map((result) => ({
        title: `${chalk.bold(result.name)} (${result.id})`,
        description: `${result.variant_count?.toLocaleString()} variants | ${result.description}`,
        value: result.id
    }));
    
    const { selectedPgsIds } = await prompts({
        type: 'multiselect',
        name: 'selectedPgsIds',
        message: 'Select PGS scores (space to select, enter to confirm):',
        choices
    });
    
    if (!selectedPgsIds || selectedPgsIds.length === 0) return;
    
    // Get subtype/biomarker name
    const { itemName } = await prompts({
        type: 'text',
        name: 'itemName',
        message: `${itemType} name:`,
        validate: value => value.length > 0 || 'Name is required'
    });
    
    const { itemKey } = await prompts({
        type: 'text',
        name: 'itemKey',
        message: `${itemType} key (lowercase, underscores):`,
        initial: itemName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        validate: value => /^[a-z_]+$/.test(value) || 'Use lowercase letters and underscores only'
    });
    
    // Add to catalog
    const targetSection = itemType === 'subtype' ? 'subtypes' : 'biomarkers';
    
    if (!catalog.trait_families[familyKey][targetSection]) {
        catalog.trait_families[familyKey][targetSection] = {};
    }
    
    const newItem = {
        name: itemName,
        pgs_ids: selectedPgsIds
    };
    
    if (itemType === 'subtype') {
        const { weight } = await prompts({
            type: 'number',
            name: 'weight',
            message: 'Weight (0.0-1.0):',
            initial: 1.0,
            validate: value => (value >= 0 && value <= 1) || 'Weight must be between 0 and 1'
        });
        newItem.weight = weight;
        
        const { description } = await prompts({
            type: 'text',
            name: 'description',
            message: 'Description:'
        });
        if (description) newItem.description = description;
    }
    
    catalog.trait_families[familyKey][targetSection][itemKey] = newItem;
    
    await saveCatalog(catalog);
    
    console.log(chalk.green(`\n✓ Added ${itemType}: ${itemName}`));
    console.log(chalk.gray(`  PGS IDs: ${selectedPgsIds.join(', ')}`));
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
        Object.entries(familyData.subtypes).forEach(([subtypeName, subtypeData]) => {
            console.log(`   ${chalk.green('▸')} ${subtypeData.name} ${chalk.gray(`(${subtypeData.pgs_id})`)}`);
            if (subtypeData.variant_count) {
                console.log(`     ${chalk.blue(subtypeData.variant_count.toLocaleString())} variants`);
            }
        });
        
        // Show biomarkers if present
        if (familyData.biomarkers) {
            Object.entries(familyData.biomarkers).forEach(([biomarkerName, biomarkerData]) => {
                console.log(`   ${chalk.yellow('◦')} ${biomarkerData.name} ${chalk.gray(`(${biomarkerData.pgs_id})`)}`);
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
            { title: '🔄 Fresh start', value: 'fresh' },
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
