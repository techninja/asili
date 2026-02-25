#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import duckdb from 'duckdb';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.join(dirname(__dirname), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

const MANIFEST_DB = path.join(dirname(__dirname), 'data_out', 'trait_manifest.db');
const TRAIT_OVERRIDES_PATH = path.join(dirname(__dirname), 'packages', 'pipeline', 'trait_overrides.json');
const GNOMAD_DB_PATH = process.env.GNOMAD_DB_PATH;
const BATCH_SIZE = 5000;
const MIN_VARIANTS = 10;

const traitStats = new Map();

if (!GNOMAD_DB_PATH || !existsSync(GNOMAD_DB_PATH)) {
  console.error('❌ GNOMAD_DB_PATH not set or file not found');
  process.exit(1);
}

console.log(`📦 Using gnomAD: ${GNOMAD_DB_PATH}`);
console.log(`📦 Using manifest: ${MANIFEST_DB}\n`);

const gnomadDb = new Database(GNOMAD_DB_PATH, { readonly: true });
const manifestDuckDb = new duckdb.Database(MANIFEST_DB);
const manifestConn = manifestDuckDb.connect();

const queryManifest = (sql) => new Promise((resolve, reject) => {
  manifestConn.all(sql, (err, result) => {
    if (err) reject(err);
    else resolve(result);
  });
});

async function getPGSList(onlyMissing = false) {
  if (onlyMissing) {
    const rows = await queryManifest(
      'SELECT pgs_id FROM pgs_scores WHERE norm_mean IS NULL OR norm_sd IS NULL ORDER BY pgs_id'
    );
    return rows.map(r => r.pgs_id);
  }
  const rows = await queryManifest('SELECT pgs_id FROM pgs_scores ORDER BY pgs_id');
  return rows.map(r => r.pgs_id);
}

async function getPGSTraits(pgsId) {
  const rows = await queryManifest(`SELECT trait_id FROM trait_pgs WHERE pgs_id = '${pgsId}'`);
  return rows.map(r => r.trait_id);
}

async function getPGSVariantCount(pgsId) {
  const duckDb = new duckdb.Database(':memory:');
  const conn = duckDb.connect();
  
  const query = (sql) => new Promise((resolve, reject) => {
    conn.all(sql, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  
  try {
    const packsDir = path.join(dirname(__dirname), 'data_out', 'packs');
    const rows = await query(`SELECT COUNT(*) as count FROM '${packsDir}/*_hg38.parquet' WHERE pgs_id = '${pgsId}'`);
    conn.close();
    duckDb.close();
    return Number(rows[0].count);
  } catch (e) {
    conn.close();
    duckDb.close();
    return 0;
  }
}

async function getPGSVariantsBatch(pgsId, offset, limit) {
  const duckDb = new duckdb.Database(':memory:');
  const conn = duckDb.connect();
  
  const query = (sql) => new Promise((resolve, reject) => {
    conn.all(sql, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
  
  try {
    const packsDir = path.join(dirname(__dirname), 'data_out', 'packs');
    const rows = await query(`SELECT variant_id, effect_weight FROM '${packsDir}/*_hg38.parquet' WHERE pgs_id = '${pgsId}' LIMIT ${limit} OFFSET ${offset}`);
    conn.close();
    duckDb.close();
    return rows;
  } catch (e) {
    conn.close();
    duckDb.close();
    throw e;
  }
}

function lookupVariantsBatch(variants) {
  const MAX_OR = 500;
  const results = [];
  
  for (let i = 0; i < variants.length; i += MAX_OR) {
    const chunk = variants.slice(i, i + MAX_OR);
    const conditions = chunk.map(() => '(chr = ? AND pos = ? AND ref = ? AND alt = ?)').join(' OR ');
    const params = chunk.flatMap(v => [v.chr, v.pos, v.ref, v.alt]);
    const sql = `SELECT chr, pos, ref, alt, af FROM variants WHERE ${conditions}`;
    
    const rows = gnomadDb.prepare(sql).all(...params);
    const resultMap = new Map(rows.map(r => [`${r.chr}:${r.pos}:${r.ref}:${r.alt}`, r.af]));
    
    chunk.forEach(v => {
      const key = `${v.chr}:${v.pos}:${v.ref}:${v.alt}`;
      const af = resultMap.get(key);
      results.push({ found: af !== undefined, af: af || null, weight: v.weight });
    });
  }
  
  return results;
}

async function calculatePGSStats(pgsId) {
  console.log(`\n📊 Processing: ${pgsId}`);
  
  const totalVariants = await getPGSVariantCount(pgsId);
  console.log(`   Total variants: ${totalVariants.toLocaleString()}`);
  
  if (totalVariants === 0) {
    console.log(`   ⚠️  No variants found`);
    return null;
  }
  
  let sumMean = 0, sumVar = 0, totalFound = 0, validVariants = 0;
  const startTime = Date.now();
  let lastUpdate = startTime;
  
  for (let offset = 0; offset < totalVariants; offset += BATCH_SIZE) {
    const variantRows = await getPGSVariantsBatch(pgsId, offset, BATCH_SIZE);
    
    const variants = variantRows.map(row => {
      const parts = row.variant_id.split(':');
      if (parts.length !== 4 || !parts[3]) return null;
      return { chr: 'chr' + parts[0], pos: parseInt(parts[1]), ref: parts[2], alt: parts[3], weight: parseFloat(row.effect_weight) };
    }).filter(v => v !== null);
    
    validVariants += variants.length;
    
    if (variants.length > 0) {
      const results = lookupVariantsBatch(variants);
      results.forEach(result => {
        if (result.found && result.af !== null) {
          const freq = result.af, beta = result.weight;
          sumMean += 2 * freq * beta;
          sumVar += 2 * freq * (1 - freq) * beta * beta;
          totalFound++;
        }
      });
    }
    
    const now = Date.now();
    if (now - lastUpdate > 2000 || offset + BATCH_SIZE >= totalVariants) {
      const progress = Math.min(offset + BATCH_SIZE, totalVariants);
      const pct = ((progress / totalVariants) * 100).toFixed(1);
      const rate = Math.round((progress / (now - startTime)) * 1000);
      process.stdout.write(`\r   Progress: ${progress.toLocaleString()}/${totalVariants.toLocaleString()} (${pct}%) | ${rate} var/s | Found: ${totalFound.toLocaleString()}`.padEnd(100));
      lastUpdate = now;
    }
  }
  
  console.log('');
  
  if (validVariants === 0) {
    console.log(`   ⚠️  No valid chr:pos:ref:alt variants (likely rsID-only or HLA format)`);
    return { pgsId, refMean: 0, refStd: 0, found: 0, total: totalVariants, coverage: 0, insufficient: true, sumMean: 0, sumVar: 0 };
  }
  
  if (validVariants < MIN_VARIANTS) {
    console.log(`   ⚠️  Too few valid variants (${validVariants}) for reliable statistics`);
    return { pgsId, refMean: 0, refStd: 0, found: totalFound, total: totalVariants, coverage: 0, insufficient: true, sumMean, sumVar };
  }
  
  const refMean = sumMean, refStd = Math.sqrt(sumVar), coverage = totalFound / validVariants;
  console.log(`   Valid variants: ${validVariants.toLocaleString()}`);
  console.log(`   Found in gnomAD: ${totalFound.toLocaleString()} (${(coverage * 100).toFixed(1)}%)`);
  console.log(`   Mean: ${refMean.toFixed(6)}, SD: ${refStd.toFixed(6)}`);
  
  return { pgsId, refMean, refStd, found: totalFound, total: totalVariants, coverage, insufficient: false, sumMean, sumVar };
}

async function updatePGSStats(pgsId, stats) {
  if (stats.insufficient) {
    await queryManifest(`UPDATE pgs_scores SET norm_mean = 0, norm_sd = 0, last_updated = CURRENT_TIMESTAMP WHERE pgs_id = '${pgsId}'`);
  } else {
    await queryManifest(`UPDATE pgs_scores SET norm_mean = ${stats.refMean}, norm_sd = ${stats.refStd}, last_updated = CURRENT_TIMESTAMP WHERE pgs_id = '${pgsId}'`);
  }
}

async function updateTraitStats(pgsId, stats) {
  if (!stats || stats.insufficient) return;
  
  const traits = await getPGSTraits(pgsId);
  for (const traitId of traits) {
    if (!traitStats.has(traitId)) {
      traitStats.set(traitId, { sumMean: 0, sumVar: 0, totalFound: 0, totalVariants: 0, pgsCount: 0 });
    }
    const ts = traitStats.get(traitId);
    ts.sumMean += stats.sumMean;
    ts.sumVar += stats.sumVar;
    ts.totalFound += stats.found;
    ts.totalVariants += stats.total;
    ts.pgsCount++;
  }
}

async function writeTraitOverrides() {
  console.log('\n📝 Updating trait_overrides.json with calculated normalization...');
  
  const overrides = JSON.parse(readFileSync(TRAIT_OVERRIDES_PATH, 'utf8'));
  let updated = 0;
  
  for (const [traitId, stats] of traitStats.entries()) {
    if (stats.totalFound > 0) {
      if (!overrides[traitId]) overrides[traitId] = {};
      overrides[traitId].norm_mean = stats.sumMean;
      overrides[traitId].norm_sd = Math.sqrt(stats.sumVar);
      overrides[traitId].norm_coverage = stats.totalFound / stats.totalVariants;
      overrides[traitId].norm_matched_variants = stats.totalFound;
      overrides[traitId].norm_source = 'gnomad_v4.1';
      updated++;
    }
  }
  
  writeFileSync(TRAIT_OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
  console.log(`✅ Updated ${updated} traits in trait_overrides.json\n`);
}

async function resetPGSStats() {
  console.log('🔄 Resetting all PGS normalization statistics...');
  await queryManifest('UPDATE pgs_scores SET norm_mean = NULL, norm_sd = NULL');
  console.log('✅ Reset complete\n');
}

(async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'reset') {
    await resetPGSStats();
    gnomadDb.close();
    manifestConn.close();
    manifestDuckDb.close();
    return;
  }
  
  const singlePGS = command && command !== 'batch' ? command : null;
  
  if (singlePGS) {
    const stats = await calculatePGSStats(singlePGS);
    if (stats) {
      await updatePGSStats(singlePGS, stats);
      console.log('\n✅ Updated database');
    } else {
      console.log('\n⚠️  Skipped - insufficient data');
    }
  } else {
    console.log('🧬 Calculating PGS Reference Statistics\n');
    
    const allPGS = await getPGSList(true);
    console.log(`📊 PGS to process: ${allPGS.length}\n`);
    
    if (allPGS.length === 0) {
      console.log('✅ All PGS already have normalization statistics!');
    } else {
      let processed = 0, skipped = 0;
      
      for (let i = 0; i < allPGS.length; i++) {
        const pgsId = allPGS[i];
        console.log(`[${i + 1}/${allPGS.length}]`);
        
        try {
          const stats = await calculatePGSStats(pgsId);
          if (stats) {
            await updatePGSStats(pgsId, stats);
            await updateTraitStats(pgsId, stats);
            stats.insufficient ? skipped++ : processed++;
          } else {
            console.log(`   ⏭️  Skipped (no data)`);
            skipped++;
          }
        } catch (error) {
          console.error(`   ❌ Error: ${error.message}`);
          skipped++;
        }
      }
      
      await writeTraitOverrides();
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Batch processing complete!');
      console.log(`   Processed: ${processed}`);
      console.log(`   Skipped: ${skipped}`);
      console.log(`   Traits updated: ${traitStats.size}`);
      console.log('='.repeat(60));
    }
  }
  
  gnomadDb.close();
  manifestConn.close();
  manifestDuckDb.close();
})();
