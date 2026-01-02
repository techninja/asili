import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { initSync, Compression, Table, writeParquet, readParquet, WriterPropertiesBuilder } from 'parquet-wasm/esm';
import pgsApiClient from '../pgs-api-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';
const TEMP_SQL_DIR = path.join(OUTPUT_DIR, 'temp_sql');
const gunzipAsync = promisify(gunzip);

// Initialize WASM module synchronously with new API
const wasmPath = './node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm';
const wasmBuffer = await fs.readFile(wasmPath);
initSync({ module: wasmBuffer });

// Global metadata cache to avoid duplicate API calls
const globalMetadataCache = new Map();

import { updateOutputManifest } from './manifest.js';

async function collectPgsMetadata(pgsIds, existingMetadata = {}) {
    const metadata = {};
    const uncachedIds = [];
    
    // Check existing manifest metadata first, then global cache
    for (const pgsId of pgsIds) {
        if (existingMetadata[pgsId]) {
            metadata[pgsId] = existingMetadata[pgsId];
        } else if (globalMetadataCache.has(pgsId)) {
            metadata[pgsId] = globalMetadataCache.get(pgsId);
        } else {
            uncachedIds.push(pgsId);
        }
    }
    
    if (uncachedIds.length === 0) {
        console.log(`    All ${pgsIds.length} PGS scores found in existing metadata`);
        return metadata;
    }
    
    console.log(`    Collecting metadata for ${uncachedIds.length} new PGS scores...`);
    
    // Process sequentially to avoid rate limits
    for (let i = 0; i < uncachedIds.length; i++) {
        const pgsId = uncachedIds[i];
        console.log(`      Processing ${pgsId} (${i+1}/${uncachedIds.length})...`);
        
        try {
            const scoreData = await pgsApiClient.getScore(pgsId);
            const pgsMetadata = {
                name: scoreData.name || '',
                trait: scoreData.trait_reported || '',
                ancestry: scoreData.ancestry_broad || ''
            };
            
            metadata[pgsId] = pgsMetadata;
            globalMetadataCache.set(pgsId, pgsMetadata);
            console.log(`      ✓ ${pgsId}: ${scoreData.trait_reported || 'Unknown trait'}`);
            
            // Save metadata to manifest after each successful fetch
            await updateOutputManifest({ metadata_update: { pgs_metadata: metadata } });
            
        } catch (error) {
            console.log(`      ⚠ ${pgsId}: ${error.message}`);
            const fallbackMetadata = {
                name: pgsId,
                trait: 'Unknown',
                ancestry: ''
            };
            metadata[pgsId] = fallbackMetadata;
            globalMetadataCache.set(pgsId, fallbackMetadata);
            
            // Save metadata to manifest even for failed fetches
            await updateOutputManifest({ metadata_update: { pgs_metadata: metadata } });
        }
        
        // Add delay between requests
        if (i < uncachedIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    return metadata;
}

async function streamProcessWithDuckDB(traitName, config) {
    console.log(`  - ${traitName}: Streaming process with DuckDB...`);
    
    const safeFileName = traitName.replace(':', '_');
    const outputPath = path.join(OUTPUT_DIR, `${safeFileName}_hg38.parquet`);
    const dbPath = path.join(OUTPUT_DIR, `${safeFileName}.duckdb`);
    const { execSync } = await import('child_process');
    
    // Check if we can resume from existing database
    let resuming = false;
    console.log(`    Checking for existing database: ${dbPath}`);
    
    try {
        await fs.access(dbPath);
        console.log(`    Database file exists, checking contents...`);
        
        const checkSQL = `SELECT COUNT(*) as count, COUNT(DISTINCT pgs_id) as pgs_count FROM pgs_staging;`;
        const checkFile = path.join(OUTPUT_DIR, 'check.sql');
        await fs.writeFile(checkFile, checkSQL);
        
        const result = execSync(`duckdb ${dbPath} < ${checkFile}`, { 
            cwd: OUTPUT_DIR,
            stdio: 'pipe',
            encoding: 'utf8'
        });
        
        const existingVariants = parseInt(result.match(/│\s*(\d+)\s*│/)?.[1] || '0');
        const existingPgsCount = parseInt(result.match(/│\s*\d+\s*│\s*(\d+)\s*│/)?.[1] || '0');
        
        await fs.unlink(checkFile);
        
        console.log(`    Database contains ${existingVariants} variants from ${existingPgsCount} PGS scores`);
        
        if (existingVariants > 0) {
            console.log(`    ✓ Resuming from existing database`);
            resuming = true;
        } else {
            console.log(`    Database is empty, starting fresh`);
        }
    } catch (error) {
        console.log(`    No existing database found: ${error.message}`);
    }
    
    if (!resuming) {
        // Clear and recreate temp SQL directory
        try {
            await fs.rm(TEMP_SQL_DIR, { recursive: true, force: true });
        } catch {}
        await fs.mkdir(TEMP_SQL_DIR, { recursive: true });
        
        // Initialize DuckDB with staging schema
        const initSQL = `
            DROP TABLE IF EXISTS pgs_staging;
            CREATE TABLE pgs_staging (
                variant_id VARCHAR,
                chr_name VARCHAR,
                chr_position BIGINT,
                effect_allele VARCHAR,
                other_allele VARCHAR,
                effect_weight DOUBLE,
                pgs_id VARCHAR,
                source_family VARCHAR,
                source_type VARCHAR,
                source_subtype VARCHAR,
                source_weight DOUBLE,
                weight_type VARCHAR,
                format_type VARCHAR
            );
        `;
        
        const initFile = path.join(OUTPUT_DIR, 'init.sql');
        await fs.writeFile(initFile, initSQL);
        
        console.log(`    Initializing DuckDB database...`);
        execSync(`duckdb ${dbPath} < ${initFile}`, { 
            cwd: OUTPUT_DIR,
            stdio: 'pipe' 
        });
        console.log(`    ✓ Database initialized`);
        
        await fs.unlink(initFile);
        
    } else {
        console.log(`    Resuming from existing database...`);
    }
    
    try {
        let totalVariants = 0;
        const pgsIds = [];
        
        // Stream each PGS file directly into DuckDB
        for (const pgsId of config.pgs_ids) {
            // Check if this PGS is already processed
            if (resuming) {
                console.log(`        Checking if ${pgsId} already processed...`);
                
                const checkSQL = `SELECT COUNT(*) as count FROM pgs_staging WHERE pgs_id = '${pgsId}';`;
                const checkFile = path.join(OUTPUT_DIR, 'check_pgs.sql');
                await fs.writeFile(checkFile, checkSQL);
                
                const result = execSync(`duckdb ${dbPath} < ${checkFile}`, { 
                    cwd: OUTPUT_DIR,
                    stdio: 'pipe',
                    encoding: 'utf8'
                });
                
                const existingCount = parseInt(result.match(/│\s*(\d+)\s*│/)?.[1] || '0');
                await fs.unlink(checkFile);
                
                console.log(`        ${pgsId}: ${existingCount} variants found in database`);
                
                if (existingCount > 0) {
                    console.log(`        ✓ Skipping ${pgsId} (already processed)`);
                    totalVariants += existingCount;
                    pgsIds.push(pgsId);
                    continue;
                } else {
                    console.log(`        Processing ${pgsId} (not in database)`);
                }
            }
            
            console.log(`        Streaming ${pgsId} into DuckDB...`);
            
            try {
                const scoreData = await pgsApiClient.getScore(pgsId);
                if (!scoreData.ftp_scoring_file) {
                    console.log(`        No scoring file found, skipping`);
                    continue;
                }
                
                const url = scoreData.ftp_scoring_file;
                const filePath = await pgsApiClient.downloadPGSFile(pgsId, url);
                
                // Decompress file for DuckDB (workaround for .gz reading issues)
                const buffer = await fs.readFile(filePath);
                const content = await gunzipAsync(buffer);
                const uncompressedPath = filePath.replace('.gz', '.tsv');
                await fs.writeFile(uncompressedPath, content);
                
                // Parse file manually to find data start and handle headers properly
                const text = content.toString('utf-8');
                const allLines = text.split('\n');
                
                // Find first non-comment line (header)
                let headerLineIndex = -1;
                let dataStartIndex = -1;
                
                for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i].trim();
                    if (!line || line.startsWith('#')) continue;
                    
                    if (headerLineIndex === -1) {
                        headerLineIndex = i;
                        dataStartIndex = i + 1;
                        break;
                    }
                }
                
                if (headerLineIndex === -1) {
                    console.log(`        No header found, skipping`);
                    continue;
                }
                
                const header = allLines[headerLineIndex];
                const columns = header.split('\t');
                
                // Create data-only file for DuckDB (no header, no comments)
                const dataLines = allLines.slice(dataStartIndex).filter(line => line.trim() && !line.startsWith('#'));
                const dataOnlyPath = filePath.replace('.gz', '_data.tsv');
                await fs.writeFile(dataOnlyPath, dataLines.join('\n'));
                
                console.log(`        Found header at line ${headerLineIndex}, data starts at ${dataStartIndex}`);
                console.log(`        Created data-only file with ${dataLines.length} rows`);
                
                if (dataLines.length === 0) {
                    console.log(`        No data found, skipping`);
                    continue;
                }
                
                // Build column mappings based on what actually exists in the file
                const buildColumnMapping = (primaryCol, fallbacks = []) => {
                    const allCols = [primaryCol, ...fallbacks];
                    for (const col of allCols) {
                        const idx = columns.indexOf(col);
                        if (idx !== -1) {
                            return `column${idx}`;
                        }
                    }
                    return "''";
                };
                
                let formatType, variantIdSQL, chrNameSQL, chrPosSQL, effectAlleleSQL, otherAlleleSQL, effectWeightSQL;
                
                if (columns.includes('chr_name') && columns.includes('chr_position') && columns.includes('rsID')) {
                    // STANDARD_SNP format with rsID
                    formatType = 'STANDARD_SNP';
                    chrNameSQL = `REPLACE(chr_name, 'chr', '')`;
                    chrPosSQL = `TRY_CAST(chr_position AS BIGINT)`;
                    effectAlleleSQL = `effect_allele`;
                    otherAlleleSQL = `other_allele`;
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                    variantIdSQL = `CONCAT(REPLACE(chr_name, 'chr', ''), ':', COALESCE(chr_position::TEXT, ''), ':', effect_allele, ':', other_allele)`;
                } else if (columns.includes('chr_name') && columns.includes('chr_position') && !columns.includes('rsID')) {
                    // STANDARD_SNP format without rsID (chr:pos format)
                    formatType = 'STANDARD_SNP_NO_RSID';
                    chrNameSQL = `REPLACE(chr_name, 'chr', '')`;
                    chrPosSQL = `TRY_CAST(chr_position AS BIGINT)`;
                    effectAlleleSQL = `effect_allele`;
                    otherAlleleSQL = `other_allele`;
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                    variantIdSQL = `CONCAT(REPLACE(chr_name, 'chr', ''), ':', COALESCE(chr_position::TEXT, ''), ':', effect_allele, ':', other_allele)`;
                } else if (columns.includes('rsID') && columns.includes('is_haplotype')) {
                    // HLA_ALLELE format
                    formatType = 'HLA_ALLELE';
                    variantIdSQL = `rsID`;
                    chrNameSQL = "''";
                    chrPosSQL = "NULL";
                    effectAlleleSQL = "effect_allele";
                    otherAlleleSQL = "''";
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                } else if (columns.includes('rsID') && !columns.includes('chr_name') && !columns.includes('is_haplotype')) {
                    // RSID_ONLY format
                    formatType = 'RSID_ONLY';
                    variantIdSQL = `rsID`;
                    chrNameSQL = "''";
                    chrPosSQL = "NULL";
                    effectAlleleSQL = `effect_allele`;
                    otherAlleleSQL = `other_allele`;
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                } else if (columns.includes('rsID') && columns.includes('chr_name') && !columns.includes('chr_position')) {
                    // RSID_CHR format
                    formatType = 'RSID_CHR';
                    variantIdSQL = `rsID`;
                    chrNameSQL = `REPLACE(chr_name, 'chr', '')`;
                    chrPosSQL = "NULL";
                    effectAlleleSQL = `effect_allele`;
                    otherAlleleSQL = `other_allele`;
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                } else {
                    console.log(`        Unsupported format - columns: ${columns.join(', ')}`);
                    continue;
                }
                
                console.log(`        Detected ${formatType} format`);
                
                // Build direct column references based on actual column positions
                const getColumnRef = (colName) => {
                    const idx = columns.indexOf(colName);
                    return idx !== -1 ? `column${idx}` : "''";
                };
                
                // Create explicit column definitions for DuckDB
                const columnDefs = columns.map((col, idx) => `'column${idx}': 'VARCHAR'`).join(', ');
                
                // Create format-specific column expressions using direct column references
                let variantIdExpression, chrNameExpression, chrPosExpression, effectAlleleExpression, otherAlleleExpression, effectWeightExpression;
                
                if (formatType === 'STANDARD_SNP' || formatType === 'STANDARD_SNP_NO_RSID') {
                    const chrNameCol = getColumnRef('chr_name');
                    const chrPosCol = getColumnRef('chr_position');
                    const effectAlleleCol = getColumnRef('effect_allele');
                    const otherAlleleCol = getColumnRef('other_allele');
                    const effectWeightCol = getColumnRef('effect_weight');
                    
                    variantIdExpression = `CONCAT(REPLACE(${chrNameCol}, 'chr', ''), ':', COALESCE(${chrPosCol}::TEXT, ''), ':', ${effectAlleleCol}, ':', ${otherAlleleCol})`;
                    chrNameExpression = `REPLACE(${chrNameCol}, 'chr', '')`;
                    chrPosExpression = `TRY_CAST(${chrPosCol} AS BIGINT)`;
                    effectAlleleExpression = effectAlleleCol;
                    otherAlleleExpression = otherAlleleCol;
                    effectWeightExpression = `TRY_CAST(${effectWeightCol} AS DOUBLE)`;
                } else if (formatType === 'HLA_ALLELE') {
                    const rsIdCol = getColumnRef('rsID');
                    const effectAlleleCol = getColumnRef('effect_allele');
                    const effectWeightCol = getColumnRef('effect_weight');
                    
                    variantIdExpression = `CASE WHEN ${rsIdCol} IS NOT NULL AND ${rsIdCol} != '' THEN ${rsIdCol} ELSE ${effectAlleleCol} END`;
                    chrNameExpression = "''";
                    chrPosExpression = "NULL";
                    effectAlleleExpression = effectAlleleCol;
                    otherAlleleExpression = "''";
                    effectWeightExpression = `TRY_CAST(${effectWeightCol} AS DOUBLE)`;
                } else {
                    // Fallback for other formats
                    const rsIdCol = getColumnRef('rsID');
                    const effectWeightCol = getColumnRef('effect_weight');
                    variantIdExpression = rsIdCol;
                    chrNameExpression = "''";
                    chrPosExpression = "NULL";
                    effectAlleleExpression = getColumnRef('effect_allele');
                    otherAlleleExpression = getColumnRef('other_allele');
                    effectWeightExpression = `TRY_CAST(${effectWeightCol} AS DOUBLE)`;
                }
                
                const importSQL = `
                    INSERT INTO pgs_staging 
                    SELECT 
                        ${variantIdExpression} as variant_id,
                        ${chrNameExpression} as chr_name,
                        ${chrPosExpression} as chr_position,
                        ${effectAlleleExpression} as effect_allele,
                        ${otherAlleleExpression} as other_allele,
                        ${effectWeightExpression} as effect_weight,
                        '${pgsId}' as pgs_id,
                        '${config.source_family || traitName}' as source_family,
                        '${config.source_type || 'trait'}' as source_type,
                        '${config.source_subtype || 'mondo'}' as source_subtype,
                        ${config.weight || 1.0} as source_weight,
                        'log_odds' as weight_type,
                        '${formatType}' as format_type
                    FROM read_csv('${dataOnlyPath}', delim='\t', header=false, columns={${columnDefs}})
                    WHERE ${effectAlleleExpression} IS NOT NULL 
                      AND ${effectAlleleExpression} != ''
                      AND ${getColumnRef('effect_weight')} IS NOT NULL
                      AND ${getColumnRef('effect_weight')} != '';
                `;
                
                const sqlFile = path.join(TEMP_SQL_DIR, `import_${pgsId}.sql`);
                await fs.writeFile(sqlFile, importSQL);
                
                console.log(`        Importing ${pgsId} data into DuckDB...`);
                try {
                    execSync(`duckdb ${dbPath} < ${sqlFile}`, { 
                        cwd: OUTPUT_DIR,
                        stdio: 'pipe',
                        encoding: 'utf8'
                    });
                    console.log(`        ✓ Import complete`);
                } catch (error) {
                    console.log(`        INSERT ERROR: ${error.message}`);
                    console.log(`        STDERR: ${error.stderr}`);
                    console.log(`        STDOUT: ${error.stdout}`);
                }
                
                // Get count
                const countSQL = `SELECT COUNT(*) as count FROM pgs_staging WHERE pgs_id = '${pgsId}';`;
                const countFile = path.join(TEMP_SQL_DIR, `count_${pgsId}.sql`);
                await fs.writeFile(countFile, countSQL);
                
                const result = execSync(`duckdb ${dbPath} < ${countFile}`, { 
                    cwd: OUTPUT_DIR,
                    stdio: 'pipe',
                    encoding: 'utf8'
                });
                
                const variantCount = parseInt(result.match(/│\s*(\d+)\s*│/)?.[1] || '0');
                console.log(`        Added ${variantCount} variants`);
                
                totalVariants += variantCount;
                pgsIds.push(pgsId);
                await fs.unlink(countFile);
                
            } catch (error) {
                console.log(`        Error processing ${pgsId}: ${error.message}`);
            }
        }
        
        if (totalVariants < 100) {
            console.log(`  - Skipped (${totalVariants} variants < 100 minimum)`);
            await fs.unlink(dbPath);
            return { totalVariants: 0, fileName: null, pgsIds: [] };
        }
        
        // Export to final parquet with ZSTD compression
        const exportSQL = `
            COPY (SELECT * FROM pgs_staging ORDER BY variant_id) 
            TO '${outputPath}' (FORMAT PARQUET, COMPRESSION ZSTD);
        `;
        
        const exportFile = path.join(OUTPUT_DIR, 'export.sql');
        await fs.writeFile(exportFile, exportSQL);
        
        console.log(`    Exporting to Parquet (${totalVariants} variants)...`);
        
        try {
            execSync(`duckdb ${dbPath} < ${exportFile}`, { 
                cwd: OUTPUT_DIR,
                stdio: 'pipe'
            });
            console.log(`    ✓ Export complete`);
        } catch (error) {
            console.log(`    Export ERROR: ${error.message}`);
            throw error;
        }
        
        // Verify the parquet file was created
        try {
            const stats = await fs.stat(outputPath);
            console.log(`    ✓ Parquet file created: ${stats.size} bytes`);
        } catch (error) {
            console.log(`    ⚠ Could not verify parquet file: ${error.message}`);
            throw new Error(`Parquet export failed: ${error.message}`);
        }
        
        // Cleanup
        await fs.unlink(exportFile);
        
        // Clean up any remaining temp files
        try {
            const files = await fs.readdir(OUTPUT_DIR);
            for (const file of files) {
                if (file.includes(safeFileName) && (file.endsWith('.sql') || file.endsWith('.tsv') || file.endsWith('_data.tsv'))) {
                    await fs.unlink(path.join(OUTPUT_DIR, file));
                }
            }
        } catch {}
        
        // Only remove DB after successful completion
        try {
            await fs.unlink(dbPath);
        } catch {}
        
        console.log(`  - Created unified file (${totalVariants} variants)`);
        return { 
            totalVariants, 
            fileName: `${safeFileName}_hg38.parquet`,
            pgsIds
        };
        
    } catch (error) {
        console.log(`  - DuckDB streaming failed: ${error.message}`);
        
        // Clean up on failure but keep DB for debugging
        try {
            const files = await fs.readdir(OUTPUT_DIR);
            for (const file of files) {
                if (file.includes(safeFileName) && (file.endsWith('.sql') || file.endsWith('.tsv') || file.endsWith('_data.tsv'))) {
                    await fs.unlink(path.join(OUTPUT_DIR, file));
                }
            }
        } catch {}
        
        throw error;
    }
}

async function needsUpdate(traitName, config) {
    console.log(`    Checking if ${traitName} needs update...`);
    
    // Check if file exists
    const safeFileName = traitName.replace(':', '_');
    const filePath = path.join(OUTPUT_DIR, `${safeFileName}_hg38.parquet`);
    try {
        const stats = await fs.stat(filePath);
        console.log(`    Output file exists: ${filePath} (${stats.size} bytes)`);
        
        // Check if file is too small (likely corrupted)
        if (stats.size < 10000) {
            console.log(`    File too small (${stats.size} bytes), will regenerate`);
            return true;
        }
        
        // Check variant count against expected
        if (config.expected_variants) {
            try {
                const verifySQL = `SELECT COUNT(*) as total FROM '${filePath}';`;
                const verifyFile = path.join(OUTPUT_DIR, 'verify_count.sql');
                await fs.writeFile(verifyFile, verifySQL);
                
                const { execSync } = await import('child_process');
                const result = execSync(`duckdb < ${verifyFile}`, { 
                    cwd: OUTPUT_DIR,
                    stdio: 'pipe',
                    encoding: 'utf8'
                });
                
                const actualVariants = parseInt(result.match(/│\s*(\d+)\s*│/)?.[1] || '0');
                await fs.unlink(verifyFile);
                
                if (actualVariants !== config.expected_variants) {
                    console.log(`    Variant count mismatch: expected ${config.expected_variants}, found ${actualVariants}, will regenerate`);
                    return true;
                }
                
                console.log(`    File valid (${actualVariants} variants match expected), skipping generation`);
                return false;
            } catch (error) {
                console.log(`    Could not verify variant count: ${error.message}, will regenerate`);
                return true;
            }
        }
        
        console.log(`    File exists, skipping generation`);
        return false;
    } catch {
        console.log(`    No output file found, will generate`);
        return true;
    }
}

async function loadExistingManifest() {
    const manifestPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
    try {
        const content = await fs.readFile(manifestPath, 'utf8');
        return JSON.parse(content);
    } catch {
        return { trait_families: {} };
    }
}

export async function generateTraitPack(traitName, config) {
    // Load existing manifest to check for existing metadata
    const existingManifest = await loadExistingManifest();
    const traitFamily = Object.values(existingManifest.trait_families || {}).find(family => 
        family.traits && family.traits[traitName]
    );
    const existingMetadata = traitFamily?.traits?.[traitName]?.pgs_metadata || {};
    
    // Only collect metadata that doesn't exist in manifest
    console.log(`  - Checking metadata for ${config.pgs_ids.length} PGS scores...`);
    const pgsMetadata = await collectPgsMetadata(config.pgs_ids, existingMetadata);
    
    const needsFileUpdate = await needsUpdate(traitName, config);
    
    if (!needsFileUpdate) {
        console.log(`  - Files up to date, metadata check complete`);
        const safeFileName = traitName.replace(':', '_');
        return {
            timestamp: new Date().toISOString(),
            variant_count: config.expected_variants || 0,
            fileName: `${safeFileName}_hg38.parquet`,
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
            const scoreData = await pgsApiClient.getScore(pgsId);
            if (scoreData.ftp_scoring_file) {
                sourceHashes[pgsId] = {
                    url: scoreData.ftp_scoring_file,
                    date_released: scoreData.date_release
                };
            }
        } catch (error) {
            console.log(`    Warning: Could not get file info for ${pgsId}`);
        }
    }
    
    // Use streaming DuckDB approach
    const result = await streamProcessWithDuckDB(traitName, config);
    
    return { 
        timestamp: new Date().toISOString(), 
        variant_count: result?.totalVariants || 0, 
        fileName: result?.fileName || null,
        pgsIds: result?.pgsIds || [],
        source_hashes: sourceHashes,
        pgs_metadata: pgsMetadata
    };
}