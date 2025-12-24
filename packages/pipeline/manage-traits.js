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
        return { traits: [] };
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

async function addTrait() {
    console.log(chalk.cyan('\n=== Add New Trait ===\n'));
    
    const { searchQuery } = await prompts({
        type: 'text',
        name: 'searchQuery',
        message: 'Search for trait (e.g., "diabetes", "alzheimer", "height"):',
        validate: value => value.length > 2 || 'Please enter at least 3 characters'
    });

    const results = await searchPGS(searchQuery);
    
    if (results.length === 0) {
        console.log(chalk.yellow('No results found. Try a different search term.'));
        return;
    }

    console.log(chalk.green(`\nFound ${results.length} results:\n`));
    
    const choices = results.slice(0, 10).map((result, index) => ({
        title: `${chalk.bold(result.name)} (${result.id})`,
        description: `${result.variant_count?.toLocaleString()} variants | ${result.description}`,
        value: result
    }));

    const { selectedTrait } = await prompts({
        type: 'select',
        name: 'selectedTrait',
        message: 'Select a trait to add:',
        choices
    });

    if (!selectedTrait) return;

    const { category } = await prompts({
        type: 'select',
        name: 'category',
        message: 'Select category:',
        choices: [
            { title: 'Disease Risk', value: 'disease' },
            { title: 'Physical Traits', value: 'physical' },
            { title: 'Behavioral', value: 'behavioral' },
            { title: 'Metabolic', value: 'metabolic' },
            { title: 'Other', value: 'other' }
        ]
    });

    const catalog = await loadCatalog();
    
    const newTrait = {
        id: selectedTrait.id.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        pgs_id: selectedTrait.id,
        name: selectedTrait.name,
        description: selectedTrait.description,
        category,
        variant_count: selectedTrait.variant_count,
        url: selectedTrait.ftp_scoring_file,
        file: `${selectedTrait.name.replace(/[^a-zA-Z0-9]/g, '_')}_hg38.parquet`,
        last_updated: new Date().toISOString()
    };

    catalog.traits.push(newTrait);
    await saveCatalog(catalog);
    
    console.log(chalk.green(`\n✓ Added trait: ${newTrait.name}`));
    console.log(chalk.gray(`  File: ${newTrait.file}`));
    console.log(chalk.gray(`  Variants: ${newTrait.variant_count?.toLocaleString()}`));
}

async function listTraits() {
    const catalog = await loadCatalog();
    
    console.log(chalk.cyan('\n=== Current Traits ===\n'));
    
    if (catalog.traits.length === 0) {
        console.log(chalk.yellow('No traits in catalog'));
        return;
    }

    catalog.traits.forEach((trait, index) => {
        console.log(`${chalk.bold(`${index + 1}. ${trait.name}`)} ${chalk.gray(`(${trait.pgs_id})`)}`);
        console.log(`   ${chalk.blue(trait.category)} | ${chalk.green(trait.variant_count?.toLocaleString() || 'Unknown')} variants`);
        console.log(`   ${chalk.gray(trait.description)}`);
        console.log();
    });
}

async function removeTrait() {
    const catalog = await loadCatalog();
    
    if (catalog.traits.length === 0) {
        console.log(chalk.yellow('No traits to remove'));
        return;
    }

    const choices = catalog.traits.map((trait, index) => ({
        title: `${trait.name} (${trait.pgs_id})`,
        description: `${trait.category} | ${trait.variant_count?.toLocaleString()} variants`,
        value: index
    }));

    const { traitIndex } = await prompts({
        type: 'select',
        name: 'traitIndex',
        message: 'Select trait to remove:',
        choices
    });

    if (traitIndex === undefined) return;

    const removedTrait = catalog.traits.splice(traitIndex, 1)[0];
    await saveCatalog(catalog);
    
    console.log(chalk.red(`✓ Removed trait: ${removedTrait.name}`));
}

async function main() {
    console.log(chalk.bold.blue('\n🧬 Asili Trait Manager\n'));

    const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
            { title: '📋 List current traits', value: 'list' },
            { title: '➕ Add new trait', value: 'add' },
            { title: '🗑️  Remove trait', value: 'remove' },
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
        case 'remove':
            await removeTrait();
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
