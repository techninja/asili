import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import {
  initSync,
  Compression,
  Table,
  writeParquet,
  readParquet,
  WriterPropertiesBuilder
} from 'parquet-wasm/esm';
import pgsApiClient from '../pgs-api-client.js';
import {
  collectPgsMetadata,
  needsUpdate,
  loadExistingManifest,
  collectSourceHashes,
  runDuckDBQuery,
  createStandardSchema,
  createStandardizedExportQuery,
  validateParquetFile,
  prepareFileForProcessing,
  shouldExcludePGS
} from './processor-core.js';
import { updateOutputManifest } from './manifest.js';
import { detectFormat, generateInsertSQL } from './harmonization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';
const PACKS_DIR = path.join(OUTPUT_DIR, 'packs');
const TEMP_SQL_DIR = path.join(OUTPUT_DIR, 'temp_sql');
const gunzipAsync = promisify(gunzip);

// Initialize WASM module synchronously with new API
const wasmPath = './node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm';
const wasmBuffer = await fs.readFile(wasmPath);
initSync({ module: wasmBuffer });

async function streamProcessWithDuckDB(traitName, config) {
  console.log(`  - ${traitName}: Streaming process with DuckDB...`);

  const safeFileName = traitName.replace(':', '_');
  const outputPath = path.join(PACKS_DIR, `${safeFileName}_hg38.parquet`);
  const dbPath = path.join(OUTPUT_DIR, `${safeFileName}.duckdb`);
  const { execSync } = await import('child_process');

  // Check if we can resume from existing database
  let resuming = false;
  console.log(`    Checking for existing database: ${dbPath}`);

  try {
    await fs.access(dbPath);
    console.log('    Database file exists, checking contents...');

    const checkSQL =
      'SELECT COUNT(*) as count, COUNT(DISTINCT pgs_id) as pgs_count FROM pgs_staging;';
    const checkFile = path.join(OUTPUT_DIR, 'check.sql');
    await fs.writeFile(checkFile, checkSQL);

    const result = execSync(`duckdb ${dbPath} < ${checkFile}`, {
      cwd: OUTPUT_DIR,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const existingVariants = parseInt(
      result.match(/│\s*(\d+)\s*│/)?.[1] || '0'
    );
    const existingPgsCount = parseInt(
      result.match(/│\s*\d+\s*│\s*(\d+)\s*│/)?.[1] || '0'
    );

    await fs.unlink(checkFile);

    console.log(
      `    Database contains ${existingVariants} variants from ${existingPgsCount} PGS scores`
    );

    if (existingVariants > 0) {
      console.log('    ✓ Resuming from existing database');
      resuming = true;
    } else {
      console.log('    Database is empty, starting fresh');
    }
  } catch (error) {
    console.log(`    No existing database found: ${error.message}`);
  }

  if (!resuming) {
    // Clear and recreate temp SQL directory and ensure packs directory exists
    try {
      await fs.rm(TEMP_SQL_DIR, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEMP_SQL_DIR, { recursive: true });
    await fs.mkdir(PACKS_DIR, { recursive: true });

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

    console.log('    Initializing DuckDB database...');
    execSync(`duckdb ${dbPath} < ${initFile}`, {
      cwd: OUTPUT_DIR,
      stdio: 'pipe'
    });
    console.log('    ✓ Database initialized');

    await fs.unlink(initFile);
  } else {
    console.log('    Resuming from existing database...');
  }

  try {
    let totalVariants = 0;
    const pgsIds = [];

    // Stream each PGS file directly into DuckDB
    for (const pgsId of config.pgs_ids) {
      // Check if this PGS should be excluded
      try {
        const scoreData = await pgsApiClient.getScore(pgsId);
        if (shouldExcludePGS(pgsId, scoreData)) {
          console.log(`        Excluding ${pgsId}: Integrative PGS with incompatible weights`);
          continue;
        }
      } catch (error) {
        console.log(`        Error checking ${pgsId} metadata: ${error.message}`);
      }
      
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

        const existingCount = parseInt(
          result.match(/│\s*(\d+)\s*│/)?.[1] || '0'
        );
        await fs.unlink(checkFile);

        console.log(
          `        ${pgsId}: ${existingCount} variants found in database`
        );

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
          console.log('        No scoring file found, skipping');
          continue;
        }

        const url = scoreData.ftp_scoring_file;
        const filePath = await pgsApiClient.downloadPGSFile(pgsId, url);

        // Decompress file for DuckDB (workaround for .gz reading issues)
        const buffer = await fs.readFile(filePath);
        const content = await gunzipAsync(buffer);
        const uncompressedPath = filePath.replace('.gz', '.tsv');
        await fs.writeFile(uncompressedPath, content);

        // Prepare file for processing
        const { columns, dataOnlyPath, dataLineCount } =
          await prepareFileForProcessing(filePath);

        console.log(
          `        Created data-only file with ${dataLineCount} rows`
        );

        if (dataLineCount === 0) {
          console.log('        No data found, skipping');
          continue;
        }

        // Detect format and generate harmonized SQL
        const formatType = detectFormat(columns);

        if (!formatType) {
          console.log(
            `        Unsupported format - columns: ${columns.join(', ')}`
          );
          continue;
        }

        console.log(`        Detected ${formatType} format`);

        const importSQL = generateInsertSQL(
          formatType,
          columns,
          dataOnlyPath,
          pgsId,
          config,
          traitName
        );

        const sqlFile = path.join(TEMP_SQL_DIR, `import_${pgsId}.sql`);
        await fs.writeFile(sqlFile, importSQL);

        console.log(`        Importing ${pgsId} data into DuckDB...`);
        try {
          execSync(`duckdb ${dbPath} < ${sqlFile}`, {
            cwd: OUTPUT_DIR,
            stdio: 'pipe',
            encoding: 'utf8'
          });
          console.log('        ✓ Import complete');
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

        const variantCount = parseInt(
          result.match(/│\s*(\d+)\s*│/)?.[1] || '0'
        );
        console.log(`        Added ${variantCount} variants`);

        totalVariants += variantCount;
        pgsIds.push(pgsId);
        await fs.unlink(countFile);
      } catch (error) {
        console.log(`        Error processing ${pgsId}: ${error.message}`);
      }
    }

    if (totalVariants === 0) {
      console.log(`  - Skipped (no variants found)`);
      await fs.unlink(dbPath);
      return { totalVariants: 0, fileName: null, pgsIds: [] };
    }

    // Export to final parquet with ZSTD compression
    console.log('    Enforcing standard schema...');
    const exportSQL = createStandardizedExportQuery('pgs_staging', outputPath, config.normalization_params);

    const exportFile = path.join(OUTPUT_DIR, 'export.sql');
    await fs.writeFile(exportFile, exportSQL);

    console.log(`    Exporting to Parquet (${totalVariants} variants)...`);

    try {
      execSync(`duckdb ${dbPath} < ${exportFile}`, {
        cwd: OUTPUT_DIR,
        stdio: 'pipe'
      });
      console.log('    ✓ Export complete');
    } catch (error) {
      console.log(`    Export ERROR: ${error.message}`);
      throw error;
    }

    // Verify the parquet file was created
    try {
      const validation = await validateParquetFile(outputPath);
      console.log(
        `    ✓ Parquet file created: ${validation.size} bytes, ${validation.variantCount} variants`
      );
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
        if (
          file.includes(safeFileName) &&
          (file.endsWith('.sql') ||
            file.endsWith('.tsv') ||
            file.endsWith('_data.tsv'))
        ) {
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
        if (
          file.includes(safeFileName) &&
          (file.endsWith('.sql') ||
            file.endsWith('.tsv') ||
            file.endsWith('_data.tsv'))
        ) {
          await fs.unlink(path.join(OUTPUT_DIR, file));
        }
      }
    } catch {}

    throw error;
  }
}

export { shouldExcludePGS } from './processor-core.js';

import { generateTraitPackBatched } from './batched-processor.js';

export async function generateTraitPack(traitName, config, allMetadataCache = null) {
  // Check if we should use batched processing for large datasets
  if (
    config.pgs_ids.length > 10 ||
    (config.expected_variants && config.expected_variants > 1000000)
  ) {
    console.log(
      `  - Using batched processing for ${traitName} (${config.pgs_ids.length} PGS files)`
    );
    return await generateTraitPackBatched(traitName, config, allMetadataCache);
  }

  // Use original processing for smaller datasets
  return await generateTraitPackOriginal(traitName, config, allMetadataCache);
}

async function generateTraitPackOriginal(traitName, config, allMetadataCache = null) {
  // Use cached metadata if provided, otherwise load from manifest
  const traitId = config.trait_id || traitName;
  const existingMetadata = allMetadataCache?.[traitId] || {};
  
  console.log(`  🔍 DEBUG: generateTraitPackOriginal for ${traitName}`);
  console.log(`  🔍 DEBUG: allMetadataCache provided: ${allMetadataCache ? 'YES' : 'NO'}`);
  console.log(`  🔍 DEBUG: existingMetadata for ${traitId}: ${Object.keys(existingMetadata).length} entries`);
  
  if (!allMetadataCache) {
    console.log(`  🔍 DEBUG: Loading from manifest file...`);
    const existingManifest = await loadExistingManifest();
    Object.assign(existingMetadata, existingManifest.traits?.[traitName]?.pgs_metadata || {});
    console.log(`  🔍 DEBUG: After manifest load: ${Object.keys(existingMetadata).length} entries`);
  }

  // Only collect metadata that doesn't exist in manifest
  console.log(
    `  - Checking metadata for ${config.pgs_ids.length} PGS scores...`
  );
  const pgsMetadata = await collectPgsMetadata(
    config.pgs_ids,
    existingMetadata,
    traitId
  );

  const needsFileUpdate = await needsUpdate(traitName, config);

  if (!needsFileUpdate) {
    console.log('  - Files up to date, updating metadata in manifest...');
    const safeFileName = traitName.replace(':', '_');
    
    // Update manifest with metadata even though files are unchanged
    await updateOutputManifest({
      [traitName]: {
        timestamp: new Date().toISOString(),
        variant_count: config.expected_variants || 0,
        fileName: `${safeFileName}_hg38.parquet`,
        pgs_metadata: pgsMetadata,
        pgsIds: config.pgs_ids,
        source_hashes: {},
        metadata_only: true
      }
    });
    
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
  const sourceHashes = await collectSourceHashes(config.pgs_ids);

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
