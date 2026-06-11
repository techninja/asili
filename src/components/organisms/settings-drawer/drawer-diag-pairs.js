/**
 * Diagnostic helpers — paired correlation and quality stats.
 * @module components/organisms/settings-drawer/drawer-diag-pairs
 */

const normName = (n) =>
  (n || '')
    .toLowerCase()
    .replace(/\s*(imputed|imp|raw|genotyped)\s*/gi, '')
    .replace(/[^a-z]/g, '');

/**
 * Compute raw↔imputed Pearson correlation for name-matched individual pairs.
 * @param {Array} individuals
 * @param {Map<string, Array>} byInd - individual ID → results array
 * @returns {string[]} Formatted output lines
 */
export function computePairedCorrelation(individuals, byInd) {
  const nameGroups = new Map();
  for (const ind of individuals) {
    const key = normName(ind.name);
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key).push(ind);
  }

  const pairs = [];
  for (const [, group] of nameGroups) {
    const rawInd = group.find((g) => !g.hasImputed);
    const impInd = group.find((g) => g.hasImputed);
    if (!rawInd || !impInd) continue;
    const rawResults = byInd.get(rawInd.id) || [];
    const impResults = byInd.get(impInd.id) || [];
    const impMap = new Map(impResults.map((r) => [r.traitId, r]));
    const zA = [],
      zB = [];
    for (const r of rawResults) {
      const ir = impMap.get(r.traitId);
      if (!ir) continue;
      const rd = r.pgsDetails?.[r.bestPGS];
      const id = ir.pgsDetails?.[ir.bestPGS];
      if (
        rd?.zScore !== null &&
        rd?.zScore !== undefined &&
        id?.zScore !== null &&
        id?.zScore !== undefined
      ) {
        zA.push(rd.zScore);
        zB.push(id.zScore);
      }
    }
    if (zA.length < 5) continue;
    const mx = zA.reduce((a, b) => a + b, 0) / zA.length;
    const my = zB.reduce((a, b) => a + b, 0) / zB.length;
    let num = 0,
      dx = 0,
      dy = 0;
    for (let i = 0; i < zA.length; i++) {
      const a = zA[i] - mx,
        b = zB[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    const r = dx && dy ? num / Math.sqrt(dx * dy) : 0;
    const dir = zA.filter(
      (z, i) => Math.sign(z) === Math.sign(zB[i]) || Math.abs(z) < 0.5 || Math.abs(zB[i]) < 0.5,
    ).length;
    pairs.push({
      name: normName(rawInd.name),
      rawEmoji: rawInd.emoji,
      impEmoji: impInd.emoji,
      r,
      dir,
      n: zA.length,
    });
  }

  const lines = [];
  if (pairs.length) {
    lines.push('', 'Raw \u2194 Imputed (same person):');
    for (const p of pairs) {
      lines.push(
        `  ${p.rawEmoji || '?'}\u2194${p.impEmoji || '?'} ${p.name}: r=${p.r.toFixed(3)} dir=${p.dir}/${p.n} (${((p.dir / p.n) * 100).toFixed(0)}%)`,
      );
    }
  }
  return lines;
}

/**
 * Compute data quality summary lines.
 * @param {Array} allResults
 * @returns {string[]} Formatted output lines
 */
export function computeQualityStats(allResults) {
  let noZ = 0,
    lowConf = 0,
    highQ = 0;
  for (const r of allResults) {
    if (!r?.bestPGS) continue;
    const det = r.pgsDetails?.[r.bestPGS];
    if (!det || det.zScore === null || det.zScore === undefined) noZ++;
    else if (det.confidence === 'insufficient' || det.confidence === 'low') lowConf++;
    if (det?.qualityScore >= 50) highQ++;
  }
  return [
    '',
    'Quality:',
    `  Unscored: ${noZ}  Low confidence: ${lowConf}  High quality (AQS\u226550): ${highQ}/${allResults.length}`,
  ];
}
