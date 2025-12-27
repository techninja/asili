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
    // Get file hashes from PGS API for validation
    const expectedHashes = new Map();
    for (const pgsId of config.pgs_ids) {
        try {
            const fileData = await pgsApiClient.getScoreFile(pgsId);
            if (fileData.results?.[0]?.ftp_scoring_file) {
                const fileInfo = fileData.results[0];
                expectedHashes.set(pgsId, {
                    size: fileInfo.size,
                    checksum: fileInfo.checksum_sha256 || fileInfo.checksum_md5,
                    date_released: fileInfo.date_released
                });
            }
        } catch (error) {
            console.log(`    Warning: Could not get file info for ${pgsId}`);
        }
    }
    
    // Check if any format-specific files exist and validate hashes
    const formatFiles = [
        `${traitName}_standard_snp_hg38.parquet`,
        `${traitName}_hla_allele_hg38.parquet`, 
        `${traitName}_rsid_only_hg38.parquet`,
        `${traitName}_rsid_chr_hg38.parquet`
    ];
    
    let hasAnyFiles = false;
    
    // Get stored hashes from catalog
    const catalog = await loadTraitCatalog();
    const [familyName, subtypeName] = traitName.split('_', 2);
    const family = catalog.trait_families[familyName];
    
    let storedHashes;
    if (family?.subtypes?.[subtypeName]) {
        storedHashes = family.subtypes[subtypeName].source_hashes;
    } else if (family?.biomarkers?.[subtypeName]) {
        storedHashes = family.biomarkers[subtypeName].source_hashes;
    }
    
    // Compare hashes - if any PGS file hash changed, regenerate
    if (storedHashes && expectedHashes.size > 0) {
        for (const [pgsId, expected] of expectedHashes) {
            const stored = storedHashes[pgsId];
            if (!stored || stored.checksum !== expected.checksum || stored.size !== expected.size) {
                console.log(`  - ${traitName}: PGS ${pgsId} changed, will regenerate`);
                return true;
            }
        }
    }
    
    for (const fileName of formatFiles) {
        const filePath = path.join(OUTPUT_DIR, fileName);
        try {
            await fs.stat(filePath);
            hasAnyFiles = true;
        } catch {
            // File doesn't exist, continue checking others
        }
    }
    
    if (!hasAnyFiles) {
        console.log(`  - ${traitName}: No files found, will download`);
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
    
    // Close all writers and validate minimum size
    const MIN_VARIANTS = 100; // Minimum variants for a valid parquet file
    
    for (const [formatKey, writer] of Object.entries(writers)) {
        await writer.close();
        
        // Only keep formats that have sufficient variants
        if (formatStats[formatKey].variant_count < MIN_VARIANTS) {
            const filePath = path.join(OUTPUT_DIR, formatStats[formatKey].file_path);
            try {
                await fs.unlink(filePath);
                console.log(`  - Deleted ${formatKey} file (${formatStats[formatKey].variant_count} variants < ${MIN_VARIANTS} minimum)`);
            } catch {}
            delete formatStats[formatKey];
        } else {
            console.log(`  - Closed ${formatKey} writer (${formatStats[formatKey].variant_count} variants)`);
        }
    }
    
    return { totalVariants, formatStats: Object.fromEntries(Object.entries(formatStats).filter(([_, stats]) => stats.variant_count > 0)) };
}

async function updateOutputManifest(updatedData) {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    let manifest = { traits: {}, generated_at: new Date().toISOString() };
    
    try {
        const existing = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(existing);
    } catch {}
    
    // Update manifest with generated files and metadata
    for (const [traitName, data] of Object.entries(updatedData)) {
        if (data.metadata_only) {
            // Only update metadata, preserve existing file info
            const existing = manifest.traits[traitName] || {};
            manifest.traits[traitName] = {
                ...existing,
                pgs_metadata: data.pgs_metadata,
                last_updated: data.timestamp
            };
        } else {
            // Full update with new files
            manifest.traits[traitName] = {
                last_updated: data.timestamp,
                variant_count: data.variant_count,
                formats: data.formats,
                source_hashes: data.source_hashes,
                pgs_metadata: data.pgs_metadata
            };
        }
    }
    
    manifest.generated_at = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

// Global metadata cache to avoid duplicate API calls
const globalMetadataCache = new Map();

async function collectPgsMetadata(pgsIds) {
    const metadata = {};
    const uncachedIds = [];
    
    // Check global cache first
    for (const pgsId of pgsIds) {
        if (globalMetadataCache.has(pgsId)) {
            metadata[pgsId] = globalMetadataCache.get(pgsId);
        } else {
            uncachedIds.push(pgsId);
        }
    }
    
    if (uncachedIds.length === 0) {
        console.log(`    All ${pgsIds.length} PGS scores found in cache`);
        return metadata;
    }
    
    const batchSize = 10; // Process in smaller batches
    console.log(`    Collecting metadata for ${uncachedIds.length} new PGS scores in batches of ${batchSize}...`);
    
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
        const batch = uncachedIds.slice(i, i + batchSize);
        console.log(`    Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uncachedIds.length/batchSize)} (${batch.length} scores)`);
        
        const batchPromises = batch.map(async (pgsId) => {
            try {
                const scoreData = await pgsApiClient.getScore(pgsId);
                return {
                    pgsId,
                    metadata: {
                        name: scoreData.name || '',
                        trait: scoreData.trait_reported || '',
                        ancestry: scoreData.ancestry_broad || ''
                    }
                };
            } catch (error) {
                console.log(`      Warning: Could not get metadata for ${pgsId}: ${error.message}`);
                return {
                    pgsId,
                    metadata: {
                        name: pgsId,
                        trait: 'Unknown',
                        ancestry: ''
                    }
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ pgsId, metadata: pgsMetadata }) => {
            metadata[pgsId] = pgsMetadata;
            globalMetadataCache.set(pgsId, pgsMetadata); // Cache for future use
        });
        
        // Small delay between batches to be respectful
        if (i + batchSize < uncachedIds.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return metadata;
}

async function generateTraitPack(traitName, config) {
    console.log(`Checking ${traitName}...`);
    
    // Always collect fresh metadata
    console.log(`  - Collecting metadata for ${config.pgs_ids.length} PGS scores...`);
    const pgsMetadata = await collectPgsMetadata(config.pgs_ids);
    
    const needsFileUpdate = await needsUpdate(traitName, config);
    
    if (!needsFileUpdate) {
        console.log(`  - Files up to date, updating metadata only`);
        return {
            timestamp: new Date().toISOString(),
            variant_count: 0, // Will be filled from existing manifest
            formats: {}, // Will be filled from existing manifest
            source_hashes: {},
            pgs_metadata: pgsMetadata,
            metadata_only: true
        };
    }
    
    console.log(`  - Generating ${traitName}...`);
    
    // Collect source file hashes for validation
    const sourceHashes = {};
    for (const pgsId of config.pgs_ids) {
        try {
            const fileData = await pgsApiClient.getScoreFile(pgsId);
            if (fileData.results?.[0]) {
                const fileInfo = fileData.results[0];
                sourceHashes[pgsId] = {
                    size: fileInfo.size,
                    checksum: fileInfo.checksum_sha256 || fileInfo.checksum_md5,
                    date_released: fileInfo.date_released
                };
            }
        } catch (error) {
            console.log(`    Warning: Could not get file info for ${pgsId}`);
        }
    }
    
    const result = await downloadAndCombinePgs(traitName, config);
    
    console.log(`Successfully processed trait pack for ${traitName} (${result.totalVariants} total variants across ${Object.keys(result.formatStats).length} formats)`);
    return { 
        timestamp: new Date().toISOString(), 
        variant_count: result.totalVariants, 
        formats: result.formatStats,
        source_hashes: sourceHashes,
        pgs_metadata: pgsMetadata
    };
}

async function main() {
    const catalog = await loadTraitCatalog();
    const traitConfigs = getTraitConfigs(catalog);
    const updatedData = {};
    
    for (const [traitName, config] of Object.entries(traitConfigs)) {
        try {
            const result = await generateTraitPack(traitName, config);
            // Always process result (either full update or metadata-only)
            updatedData[traitName] = result;
        } catch (error) {
            console.log(`Error processing ${traitName}: ${error.message}`);
        }
    }
    
    await updateOutputManifest(updatedData);
    
    // Copy canonical catalog to output as index
    const canonicalPath = path.join(__dirname, 'trait_catalog.json');
    const outputIndexPath = path.join(OUTPUT_DIR, 'trait_catalog_index.json');
    await fs.copyFile(canonicalPath, outputIndexPath);
    
    console.log('ETL Job Complete. Trait packs ready for serving.');
}

main().catch(console.error);