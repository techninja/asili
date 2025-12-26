import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import parquet from 'parquetjs';
import pgsApiClient from './pgs-api-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';
const gunzipAsync = promisify(gunzip);

// Ensure output directory exists
await fs.mkdir(OUTPUT_DIR, { recursive: true });

// PGS Format Detectors and Processors
const PGS_FORMATS = {
    STANDARD_SNP: {
        name: 'Standard SNP',
        detect: (columns) => columns.includes('chr_name') && columns.includes('chr_position'),
        schema: {
            chr_name: { type: 'UTF8' },
            chr_position: { type: 'INT64' },
            effect_allele: { type: 'UTF8' },
            other_allele: { type: 'UTF8' },
            effect_weight: { type: 'DOUBLE' },
            pgs_id: { type: 'UTF8' },
            source_family: { type: 'UTF8' },
            source_type: { type: 'UTF8' },
            source_subtype: { type: 'UTF8' },
            source_weight: { type: 'DOUBLE' },
            weight_type: { type: 'UTF8' }
        },
        harmonize: (row, pgsId, config) => {
            const chrName = (row.chr_name || row.hm_chr || row.CHR || '').toString().replace('chr', '');
            const chrPosition = parseInt(row.chr_position || row.hm_pos || row.POS);
            const effectAllele = row.effect_allele || row.EA;
            const otherAllele = row.other_allele || row.OA;
            const effectWeight = parseFloat(row.effect_weight || row.BETA || row.OR);
            
            if (!chrName || !chrPosition || !effectAllele || isNaN(effectWeight)) {
                return null;
            }
            
            return {
                chr_name: chrName,
                chr_position: chrPosition,
                effect_allele: effectAllele,
                other_allele: otherAllele || '',
                effect_weight: effectWeight,
                pgs_id: pgsId,
                source_family: config.source_family,
                source_type: config.source_type,
                source_subtype: config.source_subtype,
                source_weight: config.weight,
                weight_type: 'log_odds'
            };
        }
    },
    
    HLA_ALLELE: {
        name: 'HLA Allele',
        detect: (columns) => columns.includes('rsID') && columns.includes('is_haplotype'),
        schema: {
            variant_id: { type: 'UTF8' },
            effect_allele: { type: 'UTF8' },
            effect_weight: { type: 'DOUBLE' },
            is_interaction: { type: 'BOOLEAN' },
            is_haplotype: { type: 'BOOLEAN' },
            locus_name: { type: 'UTF8' },
            variant_type: { type: 'UTF8' },
            pgs_id: { type: 'UTF8' },
            source_family: { type: 'UTF8' },
            source_type: { type: 'UTF8' },
            source_subtype: { type: 'UTF8' },
            source_weight: { type: 'DOUBLE' },
            weight_type: { type: 'UTF8' }
        },
        harmonize: (row, pgsId, config) => {
            const variantId = row.rsID || row.variant_id || '';
            const effectAllele = row.effect_allele || '';
            const effectWeight = parseFloat(row.effect_weight || row.OR || row.BETA);
            const isInteraction = row.is_interaction === 'TRUE' || row.is_interaction === true;
            const isHaplotype = row.is_haplotype === 'TRUE' || row.is_haplotype === true;
            
            if (!effectAllele || isNaN(effectWeight)) {
                return null;
            }
            
            return {
                variant_id: variantId,
                effect_allele: effectAllele,
                effect_weight: effectWeight,
                is_interaction: isInteraction,
                is_haplotype: isHaplotype,
                locus_name: row.locus_name || '',
                variant_type: row.variant_type || 'HLA_allele',
                pgs_id: pgsId,
                source_family: config.source_family,
                source_type: config.source_type,
                source_subtype: config.source_subtype,
                source_weight: config.weight,
                weight_type: 'log_odds'
            };
        }
    },
    
    RSID_ONLY: {
        name: 'rsID Only',
        detect: (columns) => columns.includes('rsID') && !columns.includes('chr_name') && !columns.includes('is_haplotype'),
        schema: {
            rsid: { type: 'UTF8' },
            effect_allele: { type: 'UTF8' },
            other_allele: { type: 'UTF8' },
            effect_weight: { type: 'DOUBLE' },
            pgs_id: { type: 'UTF8' },
            source_family: { type: 'UTF8' },
            source_type: { type: 'UTF8' },
            source_subtype: { type: 'UTF8' },
            source_weight: { type: 'DOUBLE' },
            weight_type: { type: 'UTF8' }
        },
        harmonize: (row, pgsId, config) => {
            const rsid = row.rsID || row.rsid || '';
            const effectAllele = row.effect_allele || row.EA;
            const otherAllele = row.other_allele || row.OA;
            const effectWeight = parseFloat(row.effect_weight || row.BETA || row.OR);
            
            if (!rsid || !effectAllele || isNaN(effectWeight)) {
                return null;
            }
            
            return {
                rsid: rsid,
                effect_allele: effectAllele,
                other_allele: otherAllele || '',
                effect_weight: effectWeight,
                pgs_id: pgsId,
                source_family: config.source_family,
                source_type: config.source_type,
                source_subtype: config.source_subtype,
                source_weight: config.weight,
                weight_type: 'log_odds'
            };
        }
    },
    
    RSID_CHR: {
        name: 'rsID + Chr',
        detect: (columns) => columns.includes('rsID') && columns.includes('chr_name') && !columns.includes('chr_position'),
        schema: {
            rsid: { type: 'UTF8' },
            chr_name: { type: 'UTF8' },
            effect_allele: { type: 'UTF8' },
            effect_weight: { type: 'DOUBLE' },
            locus_name: { type: 'UTF8' },
            pgs_id: { type: 'UTF8' },
            source_family: { type: 'UTF8' },
            source_type: { type: 'UTF8' },
            source_subtype: { type: 'UTF8' },
            source_weight: { type: 'DOUBLE' },
            weight_type: { type: 'UTF8' }
        },
        harmonize: (row, pgsId, config) => {
            const rsid = row.rsID || row.rsid || '';
            const chrName = (row.chr_name || '').toString().replace('chr', '');
            const effectAllele = row.effect_allele || row.EA;
            const effectWeight = parseFloat(row.effect_weight || row.BETA || row.OR);
            
            if (!rsid || !effectAllele || isNaN(effectWeight)) {
                return null;
            }
            
            return {
                rsid: rsid,
                chr_name: chrName,
                effect_allele: effectAllele,
                effect_weight: effectWeight,
                locus_name: row.locus_name || '',
                pgs_id: pgsId,
                source_family: config.source_family,
                source_type: config.source_type,
                source_subtype: config.source_subtype,
                source_weight: config.weight,
                weight_type: 'log_odds'
            };
        }
    }
};

function detectPgsFormat(columns) {
    for (const [formatKey, format] of Object.entries(PGS_FORMATS)) {
        if (format.detect(columns)) {
            return { key: formatKey, format };
        }
    }
    return null;
}

async function loadTraitCatalog() {
    const catalogPath = path.join(__dirname, 'trait_catalog.json');
    const data = await fs.readFile(catalogPath, 'utf8');
    return JSON.parse(data);
}

function getTraitConfigs(catalog) {
    const configs = {};
    
    for (const [familyName, familyData] of Object.entries(catalog.trait_families)) {
        // Process subtypes
        for (const [subtypeName, subtypeData] of Object.entries(familyData.subtypes || {})) {
            const key = `${familyName}_${subtypeName}`;
            configs[key] = {
                pgs_ids: subtypeData.pgs_ids,
                name: subtypeData.name,
                description: subtypeData.description,
                category: familyData.category,
                source_family: familyName,
                source_type: 'subtype',
                source_subtype: subtypeName,
                weight: subtypeData.weight || 1.0
            };
        }
        
        // Process biomarkers
        if (familyData.biomarkers) {
            for (const [biomarkerName, biomarkerData] of Object.entries(familyData.biomarkers)) {
                const key = `${familyName}_${biomarkerName}`;
                configs[key] = {
                    pgs_ids: biomarkerData.pgs_ids,
                    name: biomarkerData.name,
                    description: biomarkerData.description || '',
                    category: familyData.category,
                    source_family: familyName,
                    source_type: 'biomarker',
                    source_subtype: biomarkerName,
                    weight: 1.0
                };
            }
        }
    }
    
    return configs;
}

async function needsUpdate(traitName, config) {
    // Check if any format-specific files exist and are up to date
    const formatFiles = [
        `${traitName}_standard_snp_hg38.parquet`,
        `${traitName}_hla_allele_hg38.parquet`, 
        `${traitName}_rsid_only_hg38.parquet`,
        `${traitName}_rsid_chr_hg38.parquet`
    ];
    
    let hasAnyFiles = false;
    let needsRegeneration = false;
    
    // Get last_updated from catalog for this trait
    const catalog = await loadTraitCatalog();
    const [familyName, subtypeName] = traitName.split('_', 2);
    const family = catalog.trait_families[familyName];
    
    let lastUpdated;
    if (family?.subtypes?.[subtypeName]?.last_updated) {
        lastUpdated = new Date(family.subtypes[subtypeName].last_updated);
    } else if (family?.biomarkers?.[subtypeName]?.last_updated) {
        lastUpdated = new Date(family.biomarkers[subtypeName].last_updated);
    }
    
    for (const fileName of formatFiles) {
        const filePath = path.join(OUTPUT_DIR, fileName);
        try {
            const stats = await fs.stat(filePath);
            hasAnyFiles = true;
            
            if (lastUpdated && stats.mtime < lastUpdated) {
                needsRegeneration = true;
                break;
            }
        } catch {
            // File doesn't exist, continue checking others
        }
    }
    
    if (!hasAnyFiles) {
        console.log(`  - ${traitName}: No files found, will download`);
        return true;
    }
    
    if (needsRegeneration) {
        console.log(`  - ${traitName}: Files outdated, will regenerate`);
        return true;
    }
    
    console.log(`  - ${traitName}: Files up to date, skipping`);
    return false;
}

async function downloadAndCombinePgs(traitName, config) {
    console.log(`  - ${traitName}: Processing ${config.pgs_ids.length} PGS files...`);
    
    // Track formats and create writers as needed
    const writers = {};
    const formatStats = {};
    let totalVariants = 0;
    
    for (const pgsId of config.pgs_ids) {
        console.log(`      Processing ${pgsId}...`);
        
        try {
            const url = `https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/${pgsId}/ScoringFiles/${pgsId}.txt.gz`;
            
            const response = await fetch(url, { timeout: 60000 });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const buffer = await response.arrayBuffer();
            const content = await gunzipAsync(Buffer.from(buffer));
            const text = content.toString('utf-8');
            
            const allLines = text.split('\n')
                .filter(line => !line.startsWith('#') && line.trim());
            
            if (allLines.length === 0) {
                console.log(`        No data found, skipping`);
                continue;
            }
            
            const header = allLines[0];
            const columns = header.split('\t');
            const dataLines = allLines.slice(1);
            
            // Detect format
            const formatInfo = detectPgsFormat(columns);
            if (!formatInfo) {
                console.log(`        Unsupported format - columns: ${columns.join(', ')}`);
                continue;
            }
            
            console.log(`        Detected ${formatInfo.format.name} format`);
            
            // Create writer for this format if not exists
            if (!writers[formatInfo.key]) {
                const outputPath = path.join(OUTPUT_DIR, `${traitName}_${formatInfo.key.toLowerCase()}_hg38.parquet`);
                const schema = new parquet.ParquetSchema(formatInfo.format.schema);
                writers[formatInfo.key] = await parquet.ParquetWriter.openFile(schema, outputPath);
                formatStats[formatInfo.key] = {
                    format_name: formatInfo.format.name,
                    file_path: `${traitName}_${formatInfo.key.toLowerCase()}_hg38.parquet`,
                    variant_count: 0,
                    pgs_ids: []
                };
            }
            
            // Process and write variants immediately
            let variantCount = 0;
            let filteredCount = 0;
            
            for (const line of dataLines) {
                const values = line.split('\t');
                const row = {};
                columns.forEach((col, i) => {
                    row[col] = values[i];
                });
                
                const harmonized = formatInfo.format.harmonize(row, pgsId, config);
                if (harmonized) {
                    await writers[formatInfo.key].appendRow(harmonized);
                    variantCount++;
                } else {
                    filteredCount++;
                }
            }
            
            // Update format stats
            formatStats[formatInfo.key].variant_count += variantCount;
            formatStats[formatInfo.key].pgs_ids.push(pgsId);
            
            if (filteredCount > 0) {
                console.log(`        Filtered out ${filteredCount} invalid variants`);
            }
            console.log(`        Added ${variantCount} variants`);
            totalVariants += variantCount;
            
        } catch (error) {
            console.log(`        Error: ${error.message}`);
            continue;
        }
    }
    
    // Close all writers and update catalog for each format
    for (const [formatKey, writer] of Object.entries(writers)) {
        await writer.close();
        
        // Update catalog immediately for this format
        await updateTraitCatalogFormat(traitName, formatKey, formatStats[formatKey]);
        
        console.log(`  - Closed ${formatKey} writer (${formatStats[formatKey].variant_count} variants)`);
    }
    
    return { totalVariants, formatStats };
}

async function updateTraitCatalogFormat(traitName, formatKey, formatStats) {
    const catalogPath = path.join(__dirname, 'trait_catalog.json');
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
    
    const [familyName, subtypeName] = traitName.split('_', 2);
    const family = catalog.trait_families[familyName];
    
    let targetItem;
    if (family?.subtypes?.[subtypeName]) {
        targetItem = catalog.trait_families[familyName].subtypes[subtypeName];
    } else if (family?.biomarkers?.[subtypeName]) {
        targetItem = catalog.trait_families[familyName].biomarkers[subtypeName];
    }
    
    if (targetItem) {
        // Initialize formats object if it doesn't exist
        if (!targetItem.formats) {
            targetItem.formats = {};
        }
        
        // Fetch PGS titles for this format
        const pgsMetadata = {};
        for (const pgsId of formatStats.pgs_ids) {
            try {
                const scoreData = await pgsApiClient.getScore(pgsId);
                pgsMetadata[pgsId] = {
                    name: scoreData.name || pgsId,
                    trait: scoreData.trait_reported || '',
                    ancestry: scoreData.ancestry_broad || ''
                };
            } catch (error) {
                console.log(`    Failed to fetch metadata for ${pgsId}: ${error.message}`);
                pgsMetadata[pgsId] = { name: pgsId, trait: '', ancestry: '' };
            }
        }
        
        // Update format-specific info
        targetItem.formats[formatKey] = {
            format_name: formatStats.format_name,
            file_path: formatStats.file_path,
            variant_count: formatStats.variant_count,
            pgs_ids: formatStats.pgs_ids,
            pgs_metadata: pgsMetadata,
            last_updated: new Date().toISOString()
        };
        
        // Update overall last_updated and total variant_count
        targetItem.last_updated = new Date().toISOString();
        
        // Calculate total variants across all formats
        let totalVariants = 0;
        for (const format of Object.values(targetItem.formats)) {
            totalVariants += format.variant_count;
        }
        targetItem.variant_count = totalVariants;
    }
    
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
    
    // Copy to output directory
    const outputCatalogPath = path.join(OUTPUT_DIR, 'trait_catalog.json');
    await fs.writeFile(outputCatalogPath, JSON.stringify(catalog, null, 2));
}

async function updateTraitCatalog(updatedData) {
    const catalogPath = path.join(__dirname, 'trait_catalog.json');
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
    
    // Update timestamps and variant counts
    for (const [familyName, familyData] of Object.entries(catalog.trait_families)) {
        for (const [subtypeName, subtypeData] of Object.entries(familyData.subtypes || {})) {
            const key = `${familyName}_${subtypeName}`;
            if (updatedData[key]) {
                catalog.trait_families[familyName].subtypes[subtypeName].last_updated = updatedData[key].timestamp;
                catalog.trait_families[familyName].subtypes[subtypeName].variant_count = updatedData[key].variant_count;
            }
        }
        
        if (familyData.biomarkers) {
            for (const [biomarkerName, biomarkerData] of Object.entries(familyData.biomarkers)) {
                const key = `${familyName}_${biomarkerName}`;
                if (updatedData[key]) {
                    catalog.trait_families[familyName].biomarkers[biomarkerName].last_updated = updatedData[key].timestamp;
                    catalog.trait_families[familyName].biomarkers[biomarkerName].variant_count = updatedData[key].variant_count;
                }
            }
        }
    }
    
    await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
    
    // Copy to output directory
    const outputCatalogPath = path.join(OUTPUT_DIR, 'trait_catalog.json');
    await fs.writeFile(outputCatalogPath, JSON.stringify(catalog, null, 2));
}

async function generateTraitPack(traitName, config) {
    console.log(`Checking ${traitName}...`);
    
    if (!(await needsUpdate(traitName, config))) {
        console.log(`  - Skipping ${traitName} (up to date)`);
        return null;
    }
    
    console.log(`  - Generating ${traitName}...`);
    
    const result = await downloadAndCombinePgs(traitName, config);
    if (result.totalVariants === 0) {
        console.log(`  - No data for ${traitName}, skipping`);
        return null;
    }
    
    console.log(`Successfully generated trait pack for ${traitName} (${result.totalVariants} total variants across ${Object.keys(result.formatStats).length} formats)`);
    return { timestamp: new Date().toISOString(), variant_count: result.totalVariants, formats: result.formatStats };
}

async function main() {
    const catalog = await loadTraitCatalog();
    const traitConfigs = getTraitConfigs(catalog);
    const updatedData = {};
    
    for (const [traitName, config] of Object.entries(traitConfigs)) {
        try {
            const result = await generateTraitPack(traitName, config);
            if (result) {
                updatedData[traitName] = result;
            }
        } catch (error) {
            console.log(`Error processing ${traitName}: ${error.message}`);
        }
    }
    
    await updateTraitCatalog(updatedData);
    console.log('ETL Job Complete. Trait packs ready for serving.');
}

main().catch(console.error);