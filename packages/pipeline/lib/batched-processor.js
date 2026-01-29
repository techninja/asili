import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { spawn } from 'child_process';
import pgsApiClient from '../pgs-api-client.js';
import {
  collectPgsMetadata,
  needsUpdate,
  collectSourceHashes,
  countVariantsInFile,
  runDuckDBQuery,
  validateParquetFile,
  prepareFileForProcessing
} from './processor-core.js';
import { updateOutputManifest } from './manifest.js';
import { getAllTraitMetadata } from './manifest-db-check.js';
import {
  detectFormat,
  generateColumnExpressions,
  getColumnRef,
  generateColumnDefinitions
} from './harmonization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';
const BATCH_DIR = path.join(OUTPUT_DIR, 'batches');
const PACKS_DIR = path.join(OUTPUT_DIR, 'packs');
const gunzipAsync = promisify(gunzip);

// Ensure batch directory exists
await fs.mkdir(BATCH_DIR, { recursive: true });
await fs.mkdir(PACKS_DIR, { recursive: true });

async function createBatches(pgsIds, maxVariantsPerBatch = null) {
  console.log(`📦 Analyzing ${pgsIds.length} PGS files for batching...`);

  // Dynamically adjust batch size based on dataset size
  if (!maxVariantsPerBatch) {
    if (pgsIds.length > 80) {
      maxVariantsPerBatch = 10000; // Very small batches for huge datasets
    } else if (pgsIds.length > 60) {
      maxVariantsPerBatch = 12000; // Small batches for very large datasets
    } else if (pgsIds.length > 40) {
      maxVariantsPerBatch = 15000; // Medium batches for large datasets
    } else {
      maxVariantsPerBatch = 20000; // Default batch size
    }
  }

  console.log(
    `    Using batch size: ${maxVariantsPerBatch.toLocaleString()} variants per batch`
  );

  // Get actual variant counts from cached files
  const fileInfo = [];
  for (const pgsId of pgsIds) {
    try {
      // Check if file is already cached
      const cachedFilePath = path.join(
        '/cache',
        'pgs_files',
        `${pgsId}.txt.gz`
      );
      try {
        await fs.access(cachedFilePath);
        const variantCount = await countVariantsInFile(cachedFilePath);

        fileInfo.push({
          pgs_id: pgsId,
          file_path: cachedFilePath,
          variants: variantCount
        });

        console.log(
          `    ${pgsId}: ${variantCount.toLocaleString()} variants (cached)`
        );
        continue;
      } catch {
        // File not cached, need to download
      }

      const scoreData = await pgsApiClient.getScore(pgsId);
      if (!scoreData.ftp_scoring_file) {
        console.log(`    ${pgsId}: No scoring file, skipping`);
        continue;
      }

      const filePath = await pgsApiClient.downloadPGSFile(
        pgsId,
        scoreData.ftp_scoring_file
      );
      if (!filePath) {
        console.log(`    ${pgsId}: Download failed, skipping`);
        continue;
      }

      const variantCount = await countVariantsInFile(filePath);

      fileInfo.push({
        pgs_id: pgsId,
        file_path: filePath,
        variants: variantCount,
        url: scoreData.ftp_scoring_file
      });

      console.log(`    ${pgsId}: ${variantCount.toLocaleString()} variants`);
    } catch (error) {
      console.log(`    ${pgsId}: Error - ${error.message}`);
    }
  }

  // Create batches based on variant counts
  const batches = [];
  let currentBatch = [];
  let currentCount = 0;

  for (const file of fileInfo) {
    if (
      currentCount + file.variants > maxVariantsPerBatch &&
      currentBatch.length > 0
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCount = 0;
    }

    currentBatch.push(file);
    currentCount += file.variants;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`📦 Created ${batches.length} batches`);
  return batches;
}

async function processBatchWithDuckDB(
  batch,
  batchNum,
  traitName,
  totalBatches
) {
  console.log(
    `🦆 Processing batch ${batchNum}/${totalBatches}: ${batch.length} files, ${batch.reduce((sum, f) => sum + f.variants, 0).toLocaleString()} variants`
  );

  const safeFileName = traitName.replace(':', '_');
  const batchDbPath = path.join(
    BATCH_DIR,
    `${safeFileName}_batch_${batchNum}.duckdb`
  );
  const batchOutputPath = path.join(
    BATCH_DIR,
    `${safeFileName}_batch_${batchNum}.parquet`
  );

  // Prepare data files and detect column counts
  const fileQueries = [];
  for (const file of batch) {
    if (!file.file_path || typeof file.file_path !== 'string') {
      console.log(
        `    Warning: Invalid file path for ${file.pgs_id}: ${file.file_path}`
      );
      continue;
    }

    try {
      const { columns, dataOnlyPath, dataLineCount } =
        await prepareFileForProcessing(file.file_path);

      if (dataLineCount === 0) continue;

      // Use harmonization logic to detect format and get proper column expressions
      const formatType = detectFormat(columns);
      if (!formatType) {
        console.log(
          `    Warning: Unsupported format for ${file.pgs_id} - columns: ${columns.join(', ')}`
        );
        continue;
      }

      const expressions = generateColumnExpressions(formatType, columns);
      const columnDefs = generateColumnDefinitions(columns);

      fileQueries.push(`
            -- Process ${file.pgs_id} (${formatType} format, ${columns.length} columns)
            INSERT INTO batch_variants
            SELECT 
                ${expressions.variant_id} as variant_id,
                ${expressions.effect_allele} as effect_allele,
                ${expressions.effect_weight} as effect_weight,
                '${file.pgs_id}' as pgs_id
            FROM read_csv('${dataOnlyPath}', delim='\t', header=false, columns={${columnDefs}})
            WHERE ${expressions.effect_allele} IS NOT NULL 
              AND ${expressions.effect_allele} != ''
              AND ${getColumnRef(columns, 'effect_weight')} IS NOT NULL
              AND ${getColumnRef(columns, 'effect_weight')} != '';
            `);
    } catch (error) {
      console.log(
        `    Warning: Could not prepare ${file.pgs_id}: ${error.message}`
      );
    }
  }

  // Create DuckDB subprocess to avoid memory issues
  const duckdbScript = `
        DROP TABLE IF EXISTS batch_variants;
        
        CREATE TABLE batch_variants (
            variant_id VARCHAR,
            effect_allele VARCHAR,
            effect_weight DOUBLE,
            pgs_id VARCHAR
        );
        
        ${fileQueries.join('\n')}
        
        -- Enforce standard schema
        CREATE OR REPLACE TABLE batch_variants_standardized AS
        SELECT 
            COALESCE(variant_id, '') as variant_id,
            COALESCE(effect_allele, '') as effect_allele,
            COALESCE(effect_weight, 0.0) as effect_weight,
            COALESCE(pgs_id, '') as pgs_id
        FROM batch_variants
        WHERE variant_id IS NOT NULL AND variant_id != ''
          AND effect_allele IS NOT NULL AND effect_allele != ''
          AND effect_weight IS NOT NULL;
        
        -- Export batch results
        COPY (
            SELECT DISTINCT 
                variant_id,
                effect_allele,
                effect_weight,
                pgs_id
            FROM batch_variants_standardized 
            ORDER BY variant_id
        ) TO '${batchOutputPath}' (FORMAT PARQUET, COMPRESSION SNAPPY);
    `;

  // Write SQL script
  const scriptPath = path.join(BATCH_DIR, `batch_${batchNum}.sql`);
  await fs.writeFile(scriptPath, duckdbScript);

  // Run DuckDB
  return new Promise((resolve, reject) => {
    const duckdb = spawn('duckdb', [batchDbPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: OUTPUT_DIR
    });

    duckdb.stdin.write(duckdbScript);
    duckdb.stdin.end();

    let stdout = '';
    let stderr = '';

    duckdb.stdout.on('data', data => {
      // Silent - no debug output
    });

    duckdb.stderr.on('data', data => {
      stderr += data.toString();
    });

    duckdb.on('close', async code => {
      // Cleanup temp files
      try {
        await fs.unlink(scriptPath);
        await fs.unlink(batchDbPath);

        // Cleanup data files
        for (const file of batch) {
          const dataPath = file.file_path.replace('.gz', '_data.tsv');
          try {
            await fs.unlink(dataPath);
          } catch {}
        }
      } catch {}

      if (
        code === 0 &&
        (await fs
          .access(batchOutputPath)
          .then(() => true)
          .catch(() => false))
      ) {
        console.log(`    ✅ Batch ${batchNum}/${totalBatches} complete`);
        resolve(batchOutputPath);
      } else {
        console.log(
          `    ❌ Batch ${batchNum}/${totalBatches} failed (code ${code})`
        );
        if (stderr) console.log(`    Error: ${stderr}`);
        reject(new Error(`Batch ${batchNum}/${totalBatches} failed`));
      }
    });
  });
}

async function mergeBatchResults(batchFiles, traitName) {
  console.log(`🔄 Merging ${batchFiles.length} batch results...`);

  // Filter out any undefined or invalid file paths
  const validBatchFiles = batchFiles.filter(filePath => {
    if (!filePath || typeof filePath !== 'string') {
      console.log(`    Warning: Skipping invalid batch file path: ${filePath}`);
      return false;
    }
    return true;
  });

  if (validBatchFiles.length === 0) {
    throw new Error('No valid batch files to merge');
  }

  console.log(`    Merging ${validBatchFiles.length} valid batch files`);

  const safeFileName = traitName.replace(':', '_');
  const finalOutputPath = path.join(PACKS_DIR, `${safeFileName}_hg38.parquet`);

  // For large numbers of files, use hierarchical merge to avoid memory issues
  if (validBatchFiles.length > 5) {
    return await hierarchicalMerge(
      validBatchFiles,
      finalOutputPath,
      safeFileName
    );
  }

  // Direct append for smaller datasets
  try {
    return await directAppend(validBatchFiles, finalOutputPath, safeFileName);
  } catch (error) {
    console.log(`   DEBUG: directAppend failed: ${error.message}`);
    throw error;
  }
}

async function hierarchicalMerge(batchFiles, finalOutputPath, safeFileName) {
  console.log(`📊 Using hierarchical append for ${batchFiles.length} files`);

  let currentFiles = [...batchFiles];
  let level = 1;

  // Append in groups of 5 to avoid command line length limits and memory issues
  while (currentFiles.length > 5) {
    console.log(
      `   Level ${level}: Appending ${currentFiles.length} files into groups of 5`
    );
    const nextLevelFiles = [];

    for (let i = 0; i < currentFiles.length; i += 5) {
      const group = currentFiles.slice(i, i + 5);
      const groupOutputPath = path.join(
        BATCH_DIR,
        `${safeFileName}_level${level}_group${Math.floor(i / 5)}.parquet`
      );

      await directAppend(
        group,
        groupOutputPath,
        `${safeFileName}_level${level}_group${Math.floor(i / 5)}`
      );
      nextLevelFiles.push(groupOutputPath);

      // Cleanup input files
      for (const filePath of group) {
        try {
          await fs.unlink(filePath);
        } catch {}
      }
    }

    currentFiles = nextLevelFiles;
    level++;
  }

  // Final append
  console.log(`   Final append: ${currentFiles.length} files`);
  return await directAppend(currentFiles, finalOutputPath, safeFileName);
}

async function directAppend(batchFiles, outputPath, baseName) {
  console.log(
    `    Direct append: ${batchFiles.length} files -> ${path.basename(outputPath)}`
  );

  // Use Python helper for all merges to avoid DuckDB memory issues
  const validFiles = [];
  for (const filePath of batchFiles) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      if (stats.size > 0) validFiles.push(filePath);
    } catch {
      console.log(`    Warning: Skipping invalid file: ${filePath}`);
    }
  }

  if (validFiles.length === 0) {
    throw new Error('No valid batch files found');
  }

  const { execSync } = await import('child_process');
  const scriptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'merge_parquet.py'
  );
  const cmd = `python3 ${scriptPath} ${validFiles.join(' ')} ${outputPath}`;

  try {
    execSync(cmd, { cwd: OUTPUT_DIR, stdio: 'inherit' });

    const stats = await fs.stat(outputPath);
    console.log(
      `    ✓ Merged ${validFiles.length} files (${(stats.size / 1024 / 1024).toFixed(1)}MB)`
    );

    return outputPath;
  } catch (error) {
    throw new Error(`Python merge failed: ${error.message}`);
  }
}

export async function generateTraitPackBatched(traitName, config, allMetadataCache = null) {
  const traitTitle = config.title || traitName;
  console.log(
    `🧬 Starting batched processing for ${traitTitle} (${traitName})`
  );
  console.log(`   Target: ${config.pgs_ids.length} PGS files`);

  // Use cached metadata if provided, otherwise fetch for this trait only
  const traitId = config.trait_id || traitName;
  const existingMetadata = allMetadataCache?.[traitId] || {};
  
  console.log(`  🔍 DEBUG: generateTraitPackBatched for ${traitName}`);
  console.log(`  🔍 DEBUG: allMetadataCache provided: ${allMetadataCache ? 'YES' : 'NO'}`);
  console.log(`  🔍 DEBUG: traitId: ${traitId}`);
  console.log(`  🔍 DEBUG: existingMetadata for ${traitId}: ${Object.keys(existingMetadata).length} entries`);
  
  console.log(`    Loaded ${Object.keys(existingMetadata).length} existing PGS metadata entries`);

  console.log(
    `  - Checking metadata for ${config.pgs_ids.length} PGS scores...`
  );
  const missingMetadataIds = config.pgs_ids.filter(
    pgsId => !existingMetadata[pgsId]
  );

  let pgsMetadata = existingMetadata;
  let hasNewMetadata = false;
  if (missingMetadataIds.length > 0) {
    console.log(
      `    Found ${missingMetadataIds.length} PGS scores missing metadata`
    );
    const newMetadata = await collectPgsMetadata(
      missingMetadataIds,
      existingMetadata,
      traitId
    );
    pgsMetadata = { ...existingMetadata, ...newMetadata };
    hasNewMetadata = true;

    console.log(
      `    ✓ Saved metadata for ${Object.keys(newMetadata).length} PGS scores to DB`
    );
  } else {
    console.log('    All PGS metadata already exists');
  }

  const safeFileName = traitName.replace(':', '_');
  const finalOutputPath = path.join(PACKS_DIR, `${safeFileName}_hg38.parquet`);

  // Check if final output already exists and is up-to-date
  const needsFileUpdate = await needsUpdate(traitName, config);

  if (!needsFileUpdate) {
    console.log('  - Files up to date, updating metadata in manifest...');
    
    // Update manifest with metadata even though files are unchanged
    await updateOutputManifest({
      [traitName]: {
        timestamp: new Date().toISOString(),
        variant_count: config.expected_variants || 0,
        fileName: `${safeFileName}_hg38.parquet`,
        pgs_metadata: hasNewMetadata ? pgsMetadata : {},
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
      pgs_metadata: hasNewMetadata ? pgsMetadata : {},
      metadata_only: true
    };
  }

  console.log(
    `  - Generating ${traitTitle} (${traitName}) using batched processing...`
  );

  // Collect source file hashes for validation
  const sourceHashes = await collectSourceHashes(config.pgs_ids);
  const progressFile = path.join(OUTPUT_DIR, `${safeFileName}_progress.json`);

  // Load progress for partial completion
  let progress = { completed_batches: [] };
  try {
    const progressData = await fs.readFile(progressFile, 'utf8');
    progress = JSON.parse(progressData);
    if (progress.completed_batches.length > 0) {
      console.log(
        `📂 Resuming: ${progress.completed_batches.length} batches already completed`
      );
    }
  } catch {
    // No progress file, starting fresh
  }

  // Create batches
  const batches = await createBatches(config.pgs_ids);
  const batchFiles = [];
  for (let i = 0; i < batches.length; i++) {
    const batchNum = i + 1;

    if (progress.completed_batches.includes(batchNum)) {
      const batchFile = path.join(
        BATCH_DIR,
        `${safeFileName}_batch_${batchNum}.parquet`
      );
      if (
        await fs
          .access(batchFile)
          .then(() => true)
          .catch(() => false)
      ) {
        console.log(`   Batch ${batchNum}/${batches.length}: ✅ DONE`);
        batchFiles.push(batchFile);
        continue;
      }
    }

    try {
      const batchFile = await processBatchWithDuckDB(
        batches[i],
        batchNum,
        traitName,
        batches.length
      );
      batchFiles.push(batchFile);

      // Update progress
      progress.completed_batches.push(batchNum);
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
    } catch (error) {
      console.log(
        `❌ Batch ${batchNum}/${batches.length} failed: ${error.message}`
      );
      console.log(
        `   DEBUG: Error processing batch ${batchNum} with ${batches[i].length} files`
      );
      console.log(
        `   DEBUG: Batch files: ${JSON.stringify(batches[i].map(f => f.pgs_id))}`
      );
      console.log(`   DEBUG: Error stack: ${error.stack}`);
      throw error;
    }
  }

  // Final merge
  let finalFile;
  try {
    finalFile = await mergeBatchResults(batchFiles, traitName);
  } catch (error) {
    console.log(`   DEBUG: mergeBatchResults failed for ${traitName}`);
    console.log(`   DEBUG: batchFiles count: ${batchFiles.length}`);
    console.log(`   DEBUG: Error: ${error.message}`);
    console.log(`   DEBUG: Stack: ${error.stack}`);
    throw error;
  }

  // Cleanup remaining batch files
  for (const filePath of batchFiles) {
    try {
      await fs.unlink(filePath);
    } catch {}
  }

  // Get final stats
  const finalStats = await fs.stat(finalFile);
  const fileName = path.basename(finalFile);
  console.log(
    `✅ Merge complete: ${finalFile} (${(finalStats.size / 1024 / 1024).toFixed(1)}MB)`
  );

  // Cleanup progress file
  try {
    await fs.unlink(progressFile);
  } catch {}

  // Validate final file size
  const validation = await validateParquetFile(finalFile);
  console.log(
    `✓ Merge complete: ${finalFile} (${(validation.size / 1024 / 1024).toFixed(1)}MB)`
  );

  const actualVariantCount = validation.variantCount;

  console.log(`🎯 ${traitTitle} (${traitName}) processing complete!`);
  console.log(`   File: ${validation.fileName}`);
  console.log(`   Size: ${(validation.size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`   Variants: ${actualVariantCount.toLocaleString()}`);

  // Update trait manifest with actual variant count
  await updateOutputManifest({
    trait_update: {
      [traitName]: {
        ...config,
        actual_variants: actualVariantCount,
        file_size_mb: Math.round((validation.size / 1024 / 1024) * 10) / 10,
        last_processed: new Date().toISOString()
      }
    }
  });

  return {
    timestamp: new Date().toISOString(),
    variant_count: actualVariantCount,
    fileName: validation.fileName,
    pgsIds: config.pgs_ids,
    source_hashes: sourceHashes,
    pgs_metadata: pgsMetadata
  };
}
