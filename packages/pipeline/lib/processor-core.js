import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import pgsApiClient from '../pgs-api-client.js';
import { updateOutputManifest } from './manifest.js';

const OUTPUT_DIR = '/output';
const PATHS = {
  DATA_OUT: OUTPUT_DIR,
  TRAIT_MANIFEST: '/output/trait_manifest.json',
  getTraitFile: (traitId) => `/output/packs/${traitId.replace(/:/g, '_')}_hg38.parquet`
};
const gunzipAsync = promisify(gunzip);

// Global metadata cache to avoid duplicate API calls
const globalMetadataCache = new Map();

// Filter for excluding problematic PGS scores
const EXCLUDED_PGS_IDS = ['PGS002724']; // GIGASTROKE

const LEGITIMATE_NR_METHODS = [
  'sparssnp', 'snpnet', 'penalized regression', 'lasso', 'ridge regression',
  'elastic net', 'ldpred', 'ldpred2', 'prsice', 'lassosum', 'bigstatsr', 'bigsnpr'
];

const INTEGRATIVE_METHOD_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'component', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait', 'cross-trait', 'crosstrait'
];

export function shouldExcludePGS(pgsId, scoreData) {
  if (EXCLUDED_PGS_IDS.includes(pgsId)) {
    return true;
  }
  
  const methodName = (scoreData.method_name || '').toLowerCase();
  const weightType = scoreData.weight_type || '';
  
  for (const keyword of INTEGRATIVE_METHOD_KEYWORDS) {
    if (methodName.includes(keyword)) {
      return true;
    }
  }
  
  if (weightType === 'NR') {
    for (const legitMethod of LEGITIMATE_NR_METHODS) {
      if (methodName.includes(legitMethod)) {
        return false;
      }
    }
    if (!methodName || methodName.trim() === '') {
      return true;
    }
    return false;
  }
  
  return false;
}

export async function collectPgsMetadata(pgsIds, existingMetadata = {}, traitId = null) {
  const metadata = {};
  const uncachedIds = [];
  const excludedIds = [];

  console.log(`    🔍 DEBUG: Checking metadata for ${pgsIds.length} PGS IDs`);
  console.log(`    🔍 DEBUG: existingMetadata has ${Object.keys(existingMetadata).length} entries`);
  console.log(`    🔍 DEBUG: globalMetadataCache has ${globalMetadataCache.size} entries`);

  // Check existing manifest metadata first, then global cache
  for (const pgsId of pgsIds) {
    if (existingMetadata[pgsId]) {
      console.log(`    🔍 DEBUG: ${pgsId} found in existingMetadata`);
      metadata[pgsId] = existingMetadata[pgsId];
    } else if (globalMetadataCache.has(pgsId)) {
      console.log(`    🔍 DEBUG: ${pgsId} found in globalMetadataCache`);
      metadata[pgsId] = globalMetadataCache.get(pgsId);
    } else {
      console.log(`    🔍 DEBUG: ${pgsId} NOT FOUND in cache, will fetch`);
      uncachedIds.push(pgsId);
    }
  }

  if (uncachedIds.length === 0) {
    console.log(
      `    All ${pgsIds.length} PGS scores found in existing metadata`
    );
    return metadata;
  }

  console.log(
    `    Collecting metadata for ${uncachedIds.length} new PGS scores...`
  );

  const { updateTraitMetadata } = await import('./manifest-db.js');

  // Process sequentially to avoid rate limits
  for (let i = 0; i < uncachedIds.length; i++) {
    const pgsId = uncachedIds[i];
    console.log(
      `      Processing ${pgsId} (${i + 1}/${uncachedIds.length})...`
    );

    try {
      const scoreData = await pgsApiClient.getScore(pgsId);
      
      // Check if PGS should be excluded
      if (shouldExcludePGS(pgsId, scoreData)) {
        console.log(`      ⚠ Excluding ${pgsId}: Integrative PGS with incompatible weights`);
        excludedIds.push(pgsId);
        continue;
      }
      
      const pgsMetadata = {
        name: scoreData.name || '',
        trait: scoreData.trait_reported || '',
        ancestry: scoreData.ancestry_broad || ''
      };

      metadata[pgsId] = pgsMetadata;
      globalMetadataCache.set(pgsId, pgsMetadata);
      console.log(
        `      ✓ ${pgsId}: ${scoreData.trait_reported || 'Unknown trait'}`
      );

      // Save metadata to DB immediately if traitId provided
      if (traitId) {
        await updateTraitMetadata(traitId, metadata);
      }
    } catch (error) {
      console.log(`      ⚠ ${pgsId}: ${error.message}`);
      const fallbackMetadata = {
        name: pgsId,
        trait: 'Unknown',
        ancestry: ''
      };
      metadata[pgsId] = fallbackMetadata;
      globalMetadataCache.set(pgsId, fallbackMetadata);

      // Save metadata to DB even for failed fetches
      if (traitId) {
        await updateTraitMetadata(traitId, metadata);
      }
    }

    // Add delay between requests
    if (i < uncachedIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  if (excludedIds.length > 0) {
    console.log(`    Excluded ${excludedIds.length} integrative PGS scores: ${excludedIds.join(', ')}`);
  }

  return metadata;
}

export async function needsUpdate(traitName, config) {
  console.log(`    Checking if ${traitName} needs update...`);

  // Check if file exists
  const safeFileName = traitName.replace(':', '_');
  const filePath = path.join('/output/packs', `${safeFileName}_hg38.parquet`);
  try {
    const stats = await fs.stat(filePath);
    console.log(`    Output file exists: ${filePath} (${stats.size} bytes)`);

    // Simple parquet integrity check
    try {
      await validateParquetFile(filePath);
      console.log('    File integrity verified, skipping generation');
      return false;
    } catch (error) {
      console.log(`    File integrity check failed: ${error.message}, will regenerate`);
      return true;
    }

    console.log('    File exists, skipping generation');
    return false;
  } catch {
    console.log('    No output file found, will generate');
    return true;
  }
}

export async function loadExistingManifest() {
  const manifestPath = PATHS.TRAIT_MANIFEST;
  try {
    const content = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return { traits: {} };
  }
}

export async function collectSourceHashes(pgsIds) {
  const sourceHashes = {};
  for (const pgsId of pgsIds) {
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
  return sourceHashes;
}

export async function countVariantsInFile(filePath) {
  // Count variants in PGS file without loading into memory
  try {
    const buffer = await fs.readFile(filePath);
    const content = await gunzipAsync(buffer);
    const lines = content.toString('utf-8').split('\n');

    let count = 0;
    for (const line of lines) {
      if (!line.startsWith('#') && line.trim()) {
        count++;
      }
    }
    return Math.max(0, count - 1); // Subtract header
  } catch (error) {
    if (error.message.includes('unexpected end of file')) {
      console.log(`    Corrupted file ${filePath}, removing from cache`);
      try {
        await fs.unlink(filePath);
      } catch {}
      throw new Error(`Corrupted file removed: ${filePath}`);
    }
    console.log(
      `    Warning: Could not count variants in ${filePath}: ${error.message}`
    );
    return 50000; // Conservative fallback
  }
}

export async function runDuckDBQuery(query, dbPath = null) {
  return new Promise((resolve, reject) => {
    const args = dbPath ? [dbPath] : [];
    const duckdb = spawn('duckdb', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: OUTPUT_DIR,
      env: {
        ...process.env,
        DUCKDB_MEMORY_LIMIT: '2GB'
      }
    });

    // Set timeout to prevent hanging processes (longer for large datasets)
    const timeoutMinutes =
      query.includes('DISTINCT') && query.includes('ORDER BY') ? 15 : 5;
    const timeout = setTimeout(
      () => {
        duckdb.kill('SIGKILL');
        reject(new Error(`DuckDB query timeout (${timeoutMinutes} minutes)`));
      },
      timeoutMinutes * 60 * 1000
    );

    // Add temp directory pragma for disk-based operations
    const fullQuery = `
            PRAGMA temp_directory='/tmp';
            PRAGMA memory_limit='2GB';
            ${query}
        `;

    duckdb.stdin.write(fullQuery);
    duckdb.stdin.end();

    let stdout = '';
    let stderr = '';

    duckdb.stdout.on('data', data => {
      stdout += data.toString();
    });

    duckdb.stderr.on('data', data => {
      stderr += data.toString();
    });

    duckdb.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`DuckDB query failed (code ${code}): ${stderr}`));
      }
    });

    duckdb.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export function createStandardSchema() {
  return `
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
}

export function createStandardizedExportQuery(tableName, outputPath, normalizationParams = {}) {
  // Keep raw weights - normalization will be applied to final sum
  return `
        CREATE OR REPLACE TABLE ${tableName}_standardized AS
        SELECT 
            COALESCE(variant_id, '') as variant_id,
            COALESCE(effect_allele, '') as effect_allele,
            COALESCE(effect_weight, 0.0) as effect_weight,
            COALESCE(pgs_id, '') as pgs_id
        FROM ${tableName}
        WHERE variant_id IS NOT NULL AND variant_id != ''
          AND effect_allele IS NOT NULL AND effect_allele != ''
          AND effect_weight IS NOT NULL;
        
        COPY (SELECT 
            variant_id,
            effect_allele,
            effect_weight,
            pgs_id
        FROM ${tableName}_standardized ORDER BY variant_id) 
        TO '${outputPath}' (FORMAT PARQUET, COMPRESSION ZSTD);
    `;
}

export async function validateParquetFile(filePath) {
  try {
    const stats = await fs.stat(filePath);

    // Count variants in the file - if this works, the file is valid
    const countQuery = `SELECT COUNT(*) as count FROM '${filePath}';`;
    const result = await runDuckDBQuery(countQuery);
    const variantCount = parseInt(result.match(/│\s*(\d+)\s*│/)?.[1] || '0');

    return {
      size: stats.size,
      variantCount,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    throw new Error(`File validation failed: ${error.message}`);
  }
}

export async function prepareFileForProcessing(filePath) {
  // Decompress and prepare file for DuckDB processing
  const buffer = await fs.readFile(filePath);
  const content = await gunzipAsync(buffer);
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
    throw new Error('No header found in file');
  }

  const header = allLines[headerLineIndex];
  const columns = header.split('\t');

  // Create data-only file for DuckDB (no header, no comments)
  const dataLines = allLines
    .slice(dataStartIndex)
    .filter(line => line.trim() && !line.startsWith('#'));
  const dataOnlyPath = filePath.replace('.gz', '_data.tsv');
  await fs.writeFile(dataOnlyPath, dataLines.join('\n'));

  return {
    columns,
    dataOnlyPath,
    dataLineCount: dataLines.length
  };
}
