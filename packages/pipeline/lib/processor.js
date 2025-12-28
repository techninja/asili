import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { initSync, Compression, Table, writeParquet, readParquet, WriterPropertiesBuilder } from 'parquet-wasm/esm';
import pgsApiClient from '../pgs-api-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';
const gunzipAsync = promisify(gunzip);

// Initialize WASM module synchronously with new API
const wasmPath = './node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm';
const wasmBuffer = await fs.readFile(wasmPath);
initSync({ module: wasmBuffer });

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
    
    console.log(`    Collecting metadata for ${uncachedIds.length} new PGS scores...`);
    
    // Process sequentially to avoid rate limits
    for (let i = 0; i < uncachedIds.length; i++) {
        const pgsId = uncachedIds[i];
        
        try {
            const scoreData = await pgsApiClient.getScore(pgsId);
            const pgsMetadata = {
                name: scoreData.name || '',
                trait: scoreData.trait_reported || '',
                ancestry: scoreData.ancestry_broad || ''
            };
            
            metadata[pgsId] = pgsMetadata;
            globalMetadataCache.set(pgsId, pgsMetadata);
        } catch (error) {
            console.log(`      Warning: Could not get metadata for ${pgsId}: ${error.message}`);
            const fallbackMetadata = {
                name: pgsId,
                trait: 'Unknown',
                ancestry: ''
            };
            metadata[pgsId] = fallbackMetadata;
            globalMetadataCache.set(pgsId, fallbackMetadata);
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
    
    const outputPath = path.join(OUTPUT_DIR, `${traitName}_hg38.parquet`);
    const dbPath = path.join(OUTPUT_DIR, `${traitName}.duckdb`);
    const { execSync } = await import('child_process');
    
    try {
        // Initialize DuckDB with staging schema
        const initSQL = `
            CREATE TABLE IF NOT EXISTS pgs_staging (
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
        
        execSync(`duckdb ${dbPath} < ${initFile}`, { 
            cwd: OUTPUT_DIR,
            stdio: 'pipe' 
        });
        
        await fs.unlink(initFile);
        
        let totalVariants = 0;
        const pgsIds = [];
        
        // Stream each PGS file directly into DuckDB
        for (const pgsId of config.pgs_ids) {
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
                
                if (columns.includes('chr_name') && columns.includes('chr_position')) {
                    // STANDARD_SNP format
                    formatType = 'STANDARD_SNP';
                    chrNameSQL = `REPLACE(chr_name, 'chr', '')`;
                    chrPosSQL = `TRY_CAST(chr_position AS BIGINT)`;
                    effectAlleleSQL = `effect_allele`;
                    otherAlleleSQL = `other_allele`;
                    effectWeightSQL = `TRY_CAST(effect_weight AS DOUBLE)`;
                    // Build variant ID using raw column names
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
                
                // Create explicit column mapping for DuckDB (using column positions)
                const columnMappings = columns.map((col, idx) => `column${idx} AS ${col}`).join(', ');
                
                // Create explicit column definitions for DuckDB
                const columnDefs = columns.map((col, idx) => `'column${idx}': 'VARCHAR'`).join(', ');
                
                // Create SQL with format-specific column mappings using column positions
                let variantIdExpression;
                if (formatType === 'STANDARD_SNP') {
                    const otherAlleleRef = columns.includes('other_allele') ? 'mapped.other_allele' : "''";
                    variantIdExpression = `CONCAT(REPLACE(mapped.chr_name, 'chr', ''), ':', COALESCE(mapped.chr_position::TEXT, ''), ':', mapped.effect_allele, ':', ${otherAlleleRef})`;
                } else {
                    variantIdExpression = `mapped.rsID`;
                }
                
                const otherAlleleSelect = columns.includes('other_allele') ? 'mapped.other_allele' : "''";
                
                const importSQL = `
                    INSERT INTO pgs_staging 
                    SELECT 
                        ${variantIdExpression} as variant_id,
                        ${chrNameSQL} as chr_name,
                        ${chrPosSQL} as chr_position,
                        mapped.effect_allele as effect_allele,
                        ${otherAlleleSelect} as other_allele,
                        ${effectWeightSQL} as effect_weight,
                        '${pgsId}' as pgs_id,
                        '${config.source_family}' as source_family,
                        '${config.source_type}' as source_type,
                        '${config.source_subtype}' as source_subtype,
                        ${config.weight || 1.0} as source_weight,
                        'log_odds' as weight_type,
                        '${formatType}' as format_type
                    FROM (
                        SELECT ${columnMappings}
                        FROM read_csv('${dataOnlyPath}', delim='\t', header=false, columns={${columnDefs}})
                    ) mapped
                    WHERE mapped.effect_allele IS NOT NULL 
                      AND mapped.effect_allele != ''
                      AND mapped.effect_weight IS NOT NULL
                      AND mapped.effect_weight != '';
                `;
                
                const sqlFile = path.join(OUTPUT_DIR, `import_${pgsId}.sql`);
                await fs.writeFile(sqlFile, importSQL);
                
                try {
                    execSync(`duckdb ${dbPath} < ${sqlFile}`, { 
                        cwd: OUTPUT_DIR,
                        stdio: 'pipe' 
                    });
                } catch (error) {
                    console.log(`        INSERT failed: ${error.message}`);
                    throw error;
                }
                
                // Get count
                const countSQL = `SELECT COUNT(*) as count FROM pgs_staging WHERE pgs_id = '${pgsId}';`;
                const countFile = path.join(OUTPUT_DIR, 'count.sql');
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
                
                // Cleanup
                await fs.unlink(sqlFile);
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
        
        // Ensure output directory permissions
        try {
            await fs.chmod(OUTPUT_DIR, 0o755);
        } catch (error) {
            console.log(`    Warning: Could not set directory permissions: ${error.message}`);
        }
        
        execSync(`duckdb ${dbPath} < ${exportFile}`, { 
            cwd: OUTPUT_DIR,
            stdio: 'pipe' 
        });
        
        // Cleanup
        await fs.unlink(exportFile);
        await fs.unlink(dbPath);
        
        console.log(`  - Created unified file (${totalVariants} variants)`);
        return { 
            totalVariants, 
            fileName: `${traitName}_hg38.parquet`,
            pgsIds
        };
        
    } catch (error) {
        console.log(`  - DuckDB streaming failed: ${error.message}`);
        throw error;
    }
}

async function needsUpdate(traitName, config) {
    // Get file hashes from PGS API for validation
    const expectedHashes = new Map();
    for (const pgsId of config.pgs_ids) {
        try {
            const scoreData = await pgsApiClient.getScore(pgsId);
            if (scoreData.ftp_scoring_file) {
                expectedHashes.set(pgsId, {
                    url: scoreData.ftp_scoring_file,
                    date_released: scoreData.date_release
                });
            }
        } catch (error) {
            console.log(`    Warning: Could not get file info for ${pgsId}`);
        }
    }
    
    // Check if file exists
    const filePath = path.join(OUTPUT_DIR, `${traitName}_hg38.parquet`);
    try {
        await fs.stat(filePath);
    } catch {
        console.log(`  - ${traitName}: No file found, will download`);
        return true;
    }
    
    console.log(`  - ${traitName}: File exists, skipping`);
    return false;
}

export async function generateTraitPack(traitName, config) {
    // Always collect fresh metadata
    console.log(`  - Collecting metadata for ${config.pgs_ids.length} PGS scores...`);
    const pgsMetadata = await collectPgsMetadata(config.pgs_ids);
    
    const needsFileUpdate = await needsUpdate(traitName, config);
    
    if (!needsFileUpdate) {
        console.log(`  - Files up to date, updating metadata only`);
        return {
            timestamp: new Date().toISOString(),
            variant_count: 0, // Will be filled from existing manifest
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