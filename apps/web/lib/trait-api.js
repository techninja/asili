import { getConnection } from '../../../packages/pipeline/lib/shared-db.js';
import { getPGS, getBestMetric } from '../../../packages/pipeline/lib/pgs-db.js';
import { getTraitPGS, getExcludedPGS } from '../../../packages/pipeline/lib/trait-db.js';

export async function handleTraitAPI(req, res) {
  const traitId = req.url.split('/').pop().split('?')[0];
  
  try {
    const conn = await getConnection();
    
    const trait = await new Promise((resolve, reject) => {
      conn.all('SELECT * FROM traits WHERE trait_id = ?', [traitId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });
    
    if (!trait) {
      return res.status(404).json({ error: 'Trait not found' });
    }

    const pgsScores = await getTraitPGS(traitId);
    const enriched = await Promise.all(pgsScores.map(async ({ pgs_id, performance_weight }) => {
      const pgs = await getPGS(pgs_id);
      const best = await getBestMetric(pgs_id);
      return { 
        pgs_id, 
        performance_weight,
        weight_type: pgs?.weight_type,
        method_name: pgs?.method_name,
        norm_mean: pgs?.norm_mean,
        norm_sd: pgs?.norm_sd,
        variants_count: pgs?.variants_count ? Number(pgs.variants_count) : null,
        best_metric: best
      };
    }));

    const excluded = await getExcludedPGS(traitId);

    res.json({
      trait_id: trait.trait_id,
      name: trait.editorial_name || trait.name,
      description: trait.editorial_description || trait.description,
      emoji: trait.emoji || '',
      trait_type: trait.trait_type || 'disease_risk',
      unit: trait.unit || null,
      categories: JSON.parse(trait.categories || '[]'),
      expected_variants: trait.expected_variants ? Number(trait.expected_variants) : 0,
      estimated_unique_variants: trait.estimated_unique_variants ? Number(trait.estimated_unique_variants) : 0,
      pgs_scores: enriched,
      excluded_pgs: excluded
    });
  } catch (error) {
    console.error('Trait API error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function handlePGSAPI(req, res) {
  const pgsId = req.url.split('/').pop().split('?')[0];
  
  try {
    const pgs = await getPGS(pgsId);
    
    if (!pgs) {
      return res.status(404).json({ error: 'PGS not found' });
    }

    const best = await getBestMetric(pgsId);

    res.json({
      pgs_id: pgs.pgs_id,
      weight_type: pgs.weight_type,
      method_name: pgs.method_name,
      norm_mean: pgs.norm_mean,
      norm_sd: pgs.norm_sd,
      variants_count: pgs.variants_count ? Number(pgs.variants_count) : null,
      best_metric: best
    });
  } catch (error) {
    console.error('PGS API error:', error);
    res.status(500).json({ error: error.message });
  }
}
