import {
  initSync,
  Table,
  writeParquet,
  WriterPropertiesBuilder
} from 'parquet-wasm/esm';
import { tableFromArrays, tableToIPC, Utf8, Float64, Int64, Field, Schema } from 'apache-arrow';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadTraitManifest } from './manifest-interface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = '/output';

// Initialize WASM module
const wasmPath = path.join(__dirname, '../node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm');
const wasmBuffer = await fs.readFile(wasmPath);
initSync({ module: wasmBuffer });

async function convertManifestToParquet() {
  const manifest = await loadTraitManifest();
  
  // Flatten the manifest into columnar arrays
  const mondoIds = [];
  const names = [];
  const descriptions = [];
  const categories = [];
  const variantCounts = [];
  const filePaths = [];
  const pgsIds = [];
  const pgsMetadata = [];
  const sourceHashes = [];
  const lastUpdated = [];
  const actualVariants = [];
  const fileSizeMb = [];
  const lastProcessed = [];
  const expectedVariants = [];
  const weights = [];
  const lastValidated = [];
  const canonicalUris = [];
  const excludedPgs = [];

  for (const [mondoId, trait] of Object.entries(manifest.traits)) {
    mondoIds.push(mondoId);
    names.push(trait.name);
    descriptions.push(trait.description ?? ''); // Use empty string instead of null
    categories.push(JSON.stringify(trait.categories || []));
    variantCounts.push(trait.variant_count || 0);
    filePaths.push(trait.file_path);
    pgsIds.push(JSON.stringify(trait.pgs_ids || []));
    pgsMetadata.push(JSON.stringify(trait.pgs_metadata || {}));
    sourceHashes.push(JSON.stringify(trait.source_hashes || {}));
    lastUpdated.push(trait.last_updated);
    actualVariants.push(trait.actual_variants || 0);
    fileSizeMb.push(trait.file_size_mb || 0);
    lastProcessed.push(trait.last_processed);
    expectedVariants.push(trait.expected_variants || 0);
    weights.push(trait.weight || 1.0);
    lastValidated.push(trait.last_validated ?? '');
    canonicalUris.push(trait.canonical_uri ?? '');
    excludedPgs.push(JSON.stringify(trait.excluded_pgs || []));
  }

  // Define explicit schema
  const schema = new Schema([
    new Field('mondo_id', new Utf8(), false),
    new Field('name', new Utf8(), false),
    new Field('description', new Utf8(), false),
    new Field('categories', new Utf8(), false),
    new Field('variant_count', new Int64(), false),
    new Field('file_path', new Utf8(), false),
    new Field('pgs_ids', new Utf8(), false),
    new Field('pgs_metadata', new Utf8(), false),
    new Field('source_hashes', new Utf8(), false),
    new Field('last_updated', new Utf8(), false),
    new Field('actual_variants', new Int64(), false),
    new Field('file_size_mb', new Float64(), false),
    new Field('last_processed', new Utf8(), false),
    new Field('expected_variants', new Int64(), false),
    new Field('weight', new Float64(), false),
    new Field('last_validated', new Utf8(), false),
    new Field('canonical_uri', new Utf8(), false),
    new Field('excluded_pgs', new Utf8(), false)
  ]);

  // Create Arrow table with explicit schema
  const arrowTable = tableFromArrays(
    {
      mondo_id: mondoIds,
      name: names,
      description: descriptions,
      categories: categories,
      variant_count: variantCounts,
      file_path: filePaths,
      pgs_ids: pgsIds,
      pgs_metadata: pgsMetadata,
      source_hashes: sourceHashes,
      last_updated: lastUpdated,
      actual_variants: actualVariants,
      file_size_mb: fileSizeMb,
      last_processed: lastProcessed,
      expected_variants: expectedVariants,
      weight: weights,
      last_validated: lastValidated,
      canonical_uri: canonicalUris,
      excluded_pgs: excludedPgs
    },
    schema
  );

  // Convert to IPC stream for parquet-wasm
  const ipcBuffer = tableToIPC(arrowTable, 'stream');
  const parquetTable = Table.fromIPCStream(ipcBuffer);
  
  // Write to parquet with compression
  const parquetPath = path.join(OUTPUT_DIR, 'trait_manifest.parquet');
  
  // Remove existing file if it exists (may have wrong schema)
  try {
    await fs.unlink(parquetPath);
  } catch {}
  
  const writerProperties = new WriterPropertiesBuilder()
    .setCompression('ZSTD')
    .build();
  const parquetBuffer = writeParquet(parquetTable, writerProperties);
  await fs.writeFile(parquetPath, parquetBuffer);
  
  console.log(`✓ Converted manifest to parquet: ${parquetPath}`);
  console.log(`  Traits: ${mondoIds.length}`);
  console.log(`  Size: ${(parquetBuffer.length / 1024).toFixed(2)} KB`);
  
  return parquetPath;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  convertManifestToParquet()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Failed to convert manifest:', err);
      process.exit(1);
    });
}

export { convertManifestToParquet };
