/**
 * Database query wrapper for risk results
 * Canonical source for PGS ordering and best PGS selection
 */

export class RiskResultsDB {
  constructor(conn) {
    this.conn = conn;
  }

  async storeResults(individualId, traitId, calculatorResults, traitLastUpdated) {
    const { bestPGS, bestPGSPerformance, zScore, percentile, confidence, totalMatches, pgsBreakdown, pgsDetails, value } = calculatorResults;

    // Store trait-level result
    await this.conn.query(`
      INSERT OR REPLACE INTO trait_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      individualId, traitId, bestPGS, bestPGSPerformance, zScore, percentile, confidence,
      totalMatches, this._getTotalExpectedVariants(pgsDetails), traitLastUpdated, Date.now(), value
    ]);

    // Store PGS-level results
    for (const [pgsId, breakdown] of Object.entries(pgsBreakdown)) {
      const details = pgsDetails[pgsId];
      if (!details) continue;

      const values = [
        individualId, traitId, pgsId, details.score, details.zScore, details.percentile,
        details.matchedVariants, details.metadata?.variants_count || 0, details.confidence,
        details.insufficientData, details.performanceMetric, breakdown.positive, breakdown.positiveSum,
        breakdown.negative, breakdown.negativeSum, details.sortOrder ?? null, details.value ?? null,
        JSON.stringify(breakdown.weightBuckets || []),
        JSON.stringify(breakdown.chromosomeCoverage || {})
      ];
      
      console.log(`DEBUG: Inserting PGS ${pgsId} with ${values.length} values (expected 19)`);
      
      await this.conn.query(`
        INSERT OR REPLACE INTO pgs_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, values);

      // Store top variants
      if (details.topVariants) {
        for (let i = 0; i < details.topVariants.length; i++) {
          const v = details.topVariants[i];
          await this.conn.query(`
            INSERT INTO pgs_top_variants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            individualId, traitId, pgsId, v.rsid, v.effect_allele, v.effect_weight,
            v.userGenotype, v.chromosome, v.contribution, v.standardizedContribution, i + 1
          ]);
        }
      }
    }
  }

  async getTraitResult(individualId, traitId) {
    const result = await this.conn.query(`
      SELECT * FROM trait_results WHERE individual_id = ? AND trait_id = ?
    `, [individualId, traitId]);
    
    const rows = result.toArray();
    return rows.length > 0 ? rows[0] : null;
  }

  async getPgsResults(individualId, traitId, orderBy = 'best') {
    let orderClause;
    if (orderBy === 'best') {
      orderClause = `
        ORDER BY 
          insufficient_data ASC,
          performance_metric DESC NULLS LAST,
          ABS(positive_sum + negative_sum) DESC
      `;
    } else if (orderBy === 'performance') {
      orderClause = 'ORDER BY performance_metric DESC NULLS LAST';
    } else {
      orderClause = 'ORDER BY ABS(positive_sum + negative_sum) DESC';
    }

    const result = await this.conn.query(`
      SELECT * FROM pgs_results 
      WHERE individual_id = ? AND trait_id = ?
      ${orderClause}
    `, [individualId, traitId]);

    return result.toArray();
  }

  async getPgsTopVariants(individualId, traitId, pgsId) {
    const result = await this.conn.query(`
      SELECT * FROM pgs_top_variants 
      WHERE individual_id = ? AND trait_id = ? AND pgs_id = ?
      ORDER BY rank ASC
    `, [individualId, traitId, pgsId]);

    return result.toArray();
  }

  async getBestPgs(individualId, traitId) {
    const result = await this.conn.query(`
      SELECT pgs_id, performance_metric, z_score, percentile, confidence
      FROM pgs_results 
      WHERE individual_id = ? AND trait_id = ? AND insufficient_data = FALSE
      ORDER BY performance_metric DESC NULLS LAST
      LIMIT 1
    `, [individualId, traitId]);

    const rows = result.toArray();
    return rows.length > 0 ? rows[0] : null;
  }

  _getTotalExpectedVariants(pgsDetails) {
    return Object.values(pgsDetails).reduce((sum, d) => sum + (d.metadata?.variants_count || 0), 0);
  }
}
