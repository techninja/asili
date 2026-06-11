/**
 * Score diagnostic handler — imputed vs raw comparison.
 * @module components/organisms/settings-drawer/drawer-diag-scores
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { computePairedCorrelation, computeQualityStats } from './drawer-diag-pairs.js';

/** @param {object} host */
export async function handleToggleDiagnostic(host) {
  host.diagnosticOutput = 'Running\u2026';
  try {
    await idb.openDB();
    const individuals = await idb.getAll('individuals');
    const allResults = await idb.getAll('results');
    const allKeys = await idb.getAllKeys('results');

    const byInd = new Map();
    for (let i = 0; i < allResults.length; i++) {
      const indId = String(allKeys[i]).split(':')[0];
      if (!byInd.has(indId)) byInd.set(indId, []);
      if (allResults[i]?.bestPGS) byInd.get(indId).push(allResults[i]);
    }

    const version =
      /** @type {HTMLMetaElement|null} */ (document.querySelector('meta[name="app-version"]'))
        ?.content || '?';
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const ts = now.toISOString().replace('T', ' ').slice(0, 19) + ` UTC${sign}${hh}:${mm}`;

    const lines = [
      `Asili v${version} \u2014 ${ts}`,
      `${allResults.length} results, ${individuals.length} individuals`,
      '',
    ];
    lines.push('Per-Individual:');

    const allRawZ = [],
      allImpZ = [];

    for (const ind of individuals) {
      const results = byInd.get(ind.id) || [];
      const zScores = [];
      for (const r of results) {
        const det = r.pgsDetails?.[r.bestPGS];
        if (det?.zScore !== null && det?.zScore !== undefined) zScores.push(det.zScore);
      }
      if (!zScores.length) continue;
      const mean = zScores.reduce((a, b) => a + b, 0) / zScores.length;
      const sd = Math.sqrt(zScores.reduce((a, b) => a + (b - mean) ** 2, 0) / zScores.length);
      const clamped = zScores.filter((z) => Math.abs(z) >= 3.999).length;
      const gt3 = zScores.filter((z) => Math.abs(z) > 3).length;
      const type = ind.hasImputed ? 'imp' : 'raw';
      (ind.hasImputed ? allImpZ : allRawZ).push(...zScores);
      lines.push(
        `  ${ind.emoji || '?'} ${ind.name} (${type}): ` +
          `\u03c3=${sd.toFixed(2)} z\u0304=${mean.toFixed(2)} |z|>3=${gt3} clamped=${clamped} n=${zScores.length}`,
      );
    }

    // Distribution summary
    lines.push('');
    lines.push('Distribution:');
    const summarize = (label, arr) => {
      if (!arr.length) return;
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const s = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
      const gt3 = arr.filter((z) => Math.abs(z) > 3).length;
      const sorted = [...arr].sort((a, b) => a - b);
      const p5 = sorted[Math.floor(arr.length * 0.05)];
      const p95 = sorted[Math.floor(arr.length * 0.95)];
      lines.push(
        `  ${label} (n=${arr.length}): \u03c3=${s.toFixed(2)} |z|>3=${gt3} (${((gt3 / arr.length) * 100).toFixed(1)}%) [p5=${p5?.toFixed(1)}, p95=${p95?.toFixed(1)}]`,
      );
    };
    summarize('Imputed', allImpZ);
    summarize('Raw', allRawZ);

    lines.push(...computePairedCorrelation(individuals, byInd));
    lines.push(...computeQualityStats(allResults));

    host.diagnosticOutput = lines.join('\n');
  } catch (e) {
    host.diagnosticOutput = `Error: ${e.message}`;
  }
}
