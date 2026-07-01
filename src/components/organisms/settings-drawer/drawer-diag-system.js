/**
 * System diagnostic handler for settings drawer.
 * @module components/organisms/settings-drawer/drawer-diag-system
 */

import * as idb from '/packages/core/src/data-layer/idb.js';

/** @param {object} host */
export async function handleSystemDiagnostic(host) {
  host.systemDiagnosticOutput = 'Collecting\u2026';
  try {
    await idb.openDB();
    const individuals = await idb.getAll('individuals');
    const resultKeys = await idb.getAllKeys('results');
    const variantKeys = await idb.getAllKeys('variants');

    const version =
      /** @type {HTMLMetaElement|null} */ (document.querySelector('meta[name="app-version"]'))
        ?.content || '?';
    const commit =
      /** @type {HTMLMetaElement|null} */ (document.querySelector('meta[name="app-commit"]'))
        ?.content || '';
    const commitSuffix = commit ? ` (${commit.slice(-7)})` : '';
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const ts = now.toISOString().replace('T', ' ').slice(0, 19) + ` UTC${sign}${hh}:${mm}`;

    const estimate = await navigator.storage?.estimate?.();
    const usedMB = estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) : '?';
    const quotaGB = estimate?.quota ? (estimate.quota / 1024 / 1024 / 1024).toFixed(1) : '?';

    const cores = navigator.hardwareConcurrency || '?';
    const mem = /** @type {any} */ (navigator).deviceMemory || '?';

    const lines = [
      `Asili v${version}${commitSuffix} \u2014 ${ts}`,
      '',
      'System:',
      `  Platform: ${navigator.platform}`,
      `  Cores: ${cores}  RAM: ${mem}GB (browser-reported)`,
      `  UA: ${navigator.userAgent}`,
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
      const resultCount = resultKeys.filter((k) => String(k).startsWith(ind.id + ':')).length;
      const hasVariants = variantKeys.includes(ind.id);
      lines.push(
        `  ${ind.emoji || '?'} ${ind.name}: ${ind.hasImputed ? 'imputed' : 'raw'} ` +
          `\u2014 ${resultCount} results${hasVariants ? ', variants loaded' : ''}`,
      );
    }

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
