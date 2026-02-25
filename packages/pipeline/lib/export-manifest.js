import fs from 'fs/promises';
import path from 'path';
import duckdb from 'duckdb';

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/output';

export async function exportTraitManifestJSON() {
  const DB_PATH = path.join(OUTPUT_DIR, 'trait_manifest.db');
  const db = new duckdb.Database(DB_PATH);
  const conn = db.connect();
  
  // Get all traits with their PGS associations
  const traits = await new Promise((resolve, reject) => {
    conn.all(`
      SELECT 
        t.trait_id,
        t.name,
        t.description,
        t.categories,
        t.expected_variants,
        t.estimated_unique_variants,
        t.emoji,
        t.editorial_name,
        t.editorial_description,
        t.trait_type,
        t.unit,
        t.phenotype_mean,
        t.phenotype_sd,
        t.reference_population
      FROM traits t
      ORDER BY t.name;
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });

  const manifest = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    traits: {}
  };

  for (const trait of traits) {
    const pgsScores = await new Promise((resolve, reject) => {
      conn.all(`
        SELECT tp.pgs_id, tp.performance_weight
        FROM trait_pgs tp
        WHERE tp.trait_id = ?
        ORDER BY tp.pgs_id;
      `, [trait.trait_id], (err, rows) => err ? reject(err) : resolve(rows));
    });

    let categories = [];
    try {
      categories = trait.categories ? JSON.parse(trait.categories) : [];
    } catch (e) {
      // If categories is not valid JSON, split by comma
      categories = trait.categories ? trait.categories.split(',').map(c => c.trim()).filter(Boolean) : [];
    }

    manifest.traits[trait.trait_id] = {
      trait_id: trait.trait_id,
      name: trait.editorial_name || trait.name,
      description: trait.editorial_description || trait.description,
      emoji: trait.emoji || '',
      trait_type: trait.trait_type || 'disease_risk',
      unit: trait.unit || null,
      phenotype_mean: trait.phenotype_mean || null,
      phenotype_sd: trait.phenotype_sd || null,
      reference_population: trait.reference_population || null,
      categories: categories,
      expected_variants: trait.expected_variants ? Number(trait.expected_variants) : 0,
      estimated_unique_variants: trait.estimated_unique_variants ? Number(trait.estimated_unique_variants) : 0,
      pgs_count: pgsScores.length,
      file_path: `packs/${trait.trait_id.replace(/:/g, '_')}_hg38.parquet`
    };
  }

  const outputPath = path.join(OUTPUT_DIR, 'trait_manifest.json');
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ Exported trait manifest: ${Object.keys(manifest.traits).length} traits`);
  
  conn.close();
  db.close();
  
  return manifest;
}
