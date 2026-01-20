#!/usr/bin/env node
import { convertManifestToParquet } from './lib/manifest-to-parquet.js';

console.log('Converting trait manifest to parquet...');
await convertManifestToParquet();
console.log('✓ Migration complete');
