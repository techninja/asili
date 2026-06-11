/**
 * Settings drawer handlers.
 * @module components/organisms/settings-drawer/drawer-handlers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { getScoringSettings, saveScoringSettings } from '#utils/queue-settings.js';
import { resetQueue } from '#utils/scoring-queue.js';
import { clearFamilyCache } from '#organisms/trait-grid/render-card.js';
import { clearLocalStorage, IDB_STORES, get, set, remove } from '#utils/storage.js';

/** @param {object} host */
export function close(host) {
  host.closing = true;
  setTimeout(() => {
    host.open = false;
    host.closing = false;
  }, 200);
}

/** @param {object} host */
export async function loadData(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');

  const prefs = await getScoringSettings();
  host.autoScore = prefs.autoScore;
  host.memoryLimit = prefs.memoryLimit;
  host.bandwidthLimit = prefs.bandwidthLimit || 0;
  host.ancestry = get('ancestry') || '';

  // Defer heavy storage calculation so the drawer renders immediately
  host.storageInfo = 'Calculating…';
  setTimeout(() => computeStorage(host), 50);
}

/**
 * Compute storage info without loading all data into memory.
 * Uses navigator.storage.estimate() for total size, key counts for breakdown.
 */
async function computeStorage(host) {
  const [resultKeys, variantKeys, estimate] = await Promise.all([
    idb.getAllKeys('results'),
    idb.getAllKeys('variants'),
    navigator.storage?.estimate?.(),
  ]);
  const indCount = host.individuals.length;
  const resultCount = resultKeys.length;
  const variantCount = variantKeys.length;
  const mb = estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) : '?';
  host.storageInfo = `${mb} MB stored (${indCount} individuals, ${resultCount} results, ${variantCount} variant sets)`;
}

/** @param {object} host */
export async function handleDelete(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
}

/** Rescore: clear results and dispatch global event to restart scoring. */
export async function handleRescore(_host, e) {
  const ind = e.detail;
  if (!ind?.id) return;
  window.dispatchEvent(new CustomEvent('asili-rescore', { detail: ind.id }));
}

/** Rescore all individuals sequentially. */
export async function rescoreAll(host) {
  for (const ind of host.individuals || []) {
    window.dispatchEvent(new CustomEvent('asili-rescore', { detail: ind.id }));
  }
}

/** @param {object} host @param {Event} e */
export async function handleAutoScore(host, e) {
  host.autoScore = /** @type {HTMLInputElement} */ (e.target).checked;
  await saveScoringSettings({ autoScore: host.autoScore });
}

/** @param {object} host @param {Event} e */
export async function handleMemory(host, e) {
  host.memoryLimit = /** @type {HTMLSelectElement} */ (e.target).value;
  await saveScoringSettings({ memoryLimit: host.memoryLimit });
}

/** @param {object} host @param {Event} e */
export async function handleBandwidth(host, e) {
  host.bandwidthLimit = Number(/** @type {HTMLSelectElement} */ (e.target).value);
  await saveScoringSettings({ bandwidthLimit: host.bandwidthLimit });
}

/** @param {object} host @param {Event} e */
export function handleAncestry(host, e) {
  const val = /** @type {HTMLSelectElement} */ (e.target).value;
  host.ancestry = val;
  if (val) set('ancestry', val);
  else remove('ancestry');
}

/** @param {object} host @param {Event} e */
export function handleUnits(host, e) {
  const val = /** @type {HTMLSelectElement} */ (e.target).value;
  host.units = val;
  localStorage.setItem('asili-units', val);
}

/** @param {object} _host */
export async function doClearAll(_host) {
  await resetQueue();
  clearFamilyCache();
  clearLocalStorage();
  await idb.openDB();
  for (const s of IDB_STORES) await idb.clear(s);
  window.location.href = '/';
}

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

    const version = document.querySelector('meta[name="app-version"]')?.content || '?';
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const ts = now.toISOString().replace('T', ' ').slice(0, 19) + ` UTC${sign}${hh}:${mm}`;

    const lines = [`Asili v${version} \u2014 ${ts}`, `${allResults.length} results, ${individuals.length} individuals`, ''];
    lines.push('Per-Individual:');

    const allRawZ = [], allImpZ = [];

    for (const ind of individuals) {
      const results = byInd.get(ind.id) || [];
      const zScores = [];
      for (const r of results) {
        const det = r.pgsDetails?.[r.bestPGS];
        if (det?.zScore != null) zScores.push(det.zScore);
      }
      if (!zScores.length) continue;
      const mean = zScores.reduce((a, b) => a + b, 0) / zScores.length;
      const sd = Math.sqrt(zScores.reduce((a, b) => a + (b - mean) ** 2, 0) / zScores.length);
      const clamped = zScores.filter(z => Math.abs(z) >= 3.999).length;
      const gt3 = zScores.filter(z => Math.abs(z) > 3).length;
      const type = ind.hasImputed ? 'imp' : 'raw';
      (ind.hasImputed ? allImpZ : allRawZ).push(...zScores);
      lines.push(
        `  ${ind.emoji || '?'} ${ind.name} (${type}): ` +
        `\u03c3=${sd.toFixed(2)} z\u0304=${mean.toFixed(2)} |z|>3=${gt3} clamped=${clamped} n=${zScores.length}`
      );
    }

    // Distribution summary
    lines.push('');
    lines.push('Distribution:');
    const summarize = (label, arr) => {
      if (!arr.length) return;
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const s = Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
      const gt3 = arr.filter(z => Math.abs(z) > 3).length;
      const sorted = [...arr].sort((a, b) => a - b);
      const p5 = sorted[Math.floor(arr.length * 0.05)];
      const p95 = sorted[Math.floor(arr.length * 0.95)];
      lines.push(`  ${label} (n=${arr.length}): \u03c3=${s.toFixed(2)} |z|>3=${gt3} (${((gt3 / arr.length) * 100).toFixed(1)}%) [p5=${p5?.toFixed(1)}, p95=${p95?.toFixed(1)}]`);
    };
    summarize('Imputed', allImpZ);
    summarize('Raw', allRawZ);

    // Paired correlation
    const normName = (n) => (n || '').toLowerCase().replace(/\s*(imputed|imp|raw|genotyped)\s*/gi, '').replace(/[^a-z]/g, '');
    const nameGroups = new Map();
    for (const ind of individuals) {
      const key = normName(ind.name);
      if (!nameGroups.has(key)) nameGroups.set(key, []);
      nameGroups.get(key).push(ind);
    }

    const pairs = [];
    for (const [, group] of nameGroups) {
      const rawInd = group.find(g => !g.hasImputed);
      const impInd = group.find(g => g.hasImputed);
      if (!rawInd || !impInd) continue;
      const rawResults = byInd.get(rawInd.id) || [];
      const impResults = byInd.get(impInd.id) || [];
      const impMap = new Map(impResults.map(r => [r.traitId, r]));
      const zA = [], zB = [];
      for (const r of rawResults) {
        const ir = impMap.get(r.traitId);
        if (!ir) continue;
        const rd = r.pgsDetails?.[r.bestPGS];
        const id = ir.pgsDetails?.[ir.bestPGS];
        if (rd?.zScore != null && id?.zScore != null) { zA.push(rd.zScore); zB.push(id.zScore); }
      }
      if (zA.length < 5) continue;
      const mx = zA.reduce((a, b) => a + b, 0) / zA.length;
      const my = zB.reduce((a, b) => a + b, 0) / zB.length;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < zA.length; i++) {
        const a = zA[i] - mx, b = zB[i] - my;
        num += a * b; dx += a * a; dy += b * b;
      }
      const r = dx && dy ? num / Math.sqrt(dx * dy) : 0;
      const dir = zA.filter((z, i) => Math.sign(z) === Math.sign(zB[i]) || Math.abs(z) < 0.5 || Math.abs(zB[i]) < 0.5).length;
      pairs.push({ name: normName(rawInd.name), rawEmoji: rawInd.emoji, impEmoji: impInd.emoji, r, dir, n: zA.length });
    }

    if (pairs.length) {
      lines.push('');
      lines.push('Raw \u2194 Imputed (same person):');
      for (const p of pairs) {
        lines.push(`  ${p.rawEmoji || '?'}\u2194${p.impEmoji || '?'} ${p.name}: r=${p.r.toFixed(3)} dir=${p.dir}/${p.n} (${((p.dir / p.n) * 100).toFixed(0)}%)`);
      }
    }

    // Data quality
    lines.push('');
    lines.push('Quality:');
    let noZ = 0, lowConf = 0, highQ = 0;
    for (const r of allResults) {
      if (!r?.bestPGS) continue;
      const det = r.pgsDetails?.[r.bestPGS];
      if (!det || det.zScore == null) noZ++;
      else if (det.confidence === 'insufficient' || det.confidence === 'low') lowConf++;
      if (det?.qualityScore >= 50) highQ++;
    }
    lines.push(`  Unscored: ${noZ}  Low confidence: ${lowConf}  High quality (AQS\u226550): ${highQ}/${allResults.length}`);

    host.diagnosticOutput = lines.join('\n');
  } catch (e) {
    host.diagnosticOutput = `Error: ${e.message}`;
  }
}

/** @param {object} host */
export async function handleSystemDiagnostic(host) {
  host.systemDiagnosticOutput = 'Collecting\u2026';
  try {
    await idb.openDB();
    const individuals = await idb.getAll('individuals');
    const resultKeys = await idb.getAllKeys('results');
    const variantKeys = await idb.getAllKeys('variants');

    const version = document.querySelector('meta[name="app-version"]')?.content || '?';
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const ts = now.toISOString().replace('T', ' ').slice(0, 19) + ` UTC${sign}${hh}:${mm}`;

    const estimate = await navigator.storage?.estimate?.();
    const usedMB = estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) : '?';
    const quotaGB = estimate?.quota ? (estimate.quota / 1024 / 1024 / 1024).toFixed(1) : '?';

    const ua = navigator.userAgent;
    const cores = navigator.hardwareConcurrency || '?';
    const mem = navigator.deviceMemory || '?';

    const lines = [
      `Asili v${version} \u2014 ${ts}`,
      '',
      'System:',
      `  Platform: ${navigator.platform}`,
      `  Cores: ${cores}  RAM: ${mem}GB (browser-reported)`,
      `  UA: ${ua}`,
      '',
      'Storage:',
      `  Used: ${usedMB} MB / ${quotaGB} GB quota`,
      `  Individuals: ${individuals.length}`,
      `  Results: ${resultKeys.length}`,
      `  Variant sets: ${variantKeys.length}`,
      '',
      'Individuals:',
    ];

    for (const ind of individuals) {
      const resultCount = resultKeys.filter(k => String(k).startsWith(ind.id + ':')).length;
      const hasVariants = variantKeys.includes(ind.id);
      lines.push(
        `  ${ind.emoji || '?'} ${ind.name}: ${ind.hasImputed ? 'imputed' : 'raw'} ` +
        `\u2014 ${resultCount} results${hasVariants ? ', variants loaded' : ''}`
      );
    }

    // Network: check data endpoint
    lines.push('');
    lines.push('Data:');
    try {
      const t0 = performance.now();
      const r = await fetch('/data/pgs_norm_params.json', { method: 'HEAD' });
      const latency = (performance.now() - t0).toFixed(0);
      lines.push(`  Norm params: ${r.ok ? '\u2713' : '\u2717'} (${latency}ms)`);
    } catch (e) {
      lines.push(`  Norm params: \u2717 (${e.message})`);
    }
    try {
      const t0 = performance.now();
      const r = await fetch('/data/trait_manifest.json', { method: 'HEAD' });
      const latency = (performance.now() - t0).toFixed(0);
      lines.push(`  Trait manifest: ${r.ok ? '\u2713' : '\u2717'} (${latency}ms)`);
    } catch (e) {
      lines.push(`  Trait manifest: \u2717 (${e.message})`);
    }

    host.systemDiagnosticOutput = lines.join('\n');
  } catch (e) {
    host.systemDiagnosticOutput = `Error: ${e.message}`;
  }
}
