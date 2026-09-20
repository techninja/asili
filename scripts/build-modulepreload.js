/**
 * Module preload builder — statically crawls ES module imports and injects
 * <link rel="modulepreload"> tags into index.html so the browser fetches all
 * modules in parallel instead of chaining waterfall requests.
 *
 * Importmap safety: modules that directly import bare specifiers are excluded
 * from preload (the browser can race importmap registration when parsing
 * preloaded modules). Bare specifier targets (vendor files) are preloaded
 * first so they are in the module cache before any dependent module runs.
 * @module lib/build-modulepreload
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';

/** Extract the importmap object from an HTML string, or return {}. */
function parseImportMap(html) {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  try {
    return m ? (JSON.parse(m[1]).imports ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} srcDir
 * @param {string} entryFile
 * @param {string[]} ignoreDirs
 * @returns {{ order: string[], hasBareImport: Set<string> }}
 */
export function crawlModules(srcDir, entryFile, ignoreDirs = ['vendor', 'deps']) {
  const visited = new Set();
  const order = [];
  const hasBareImport = new Set();

  /**
   *
   */
  function crawl(relPath) {
    if (visited.has(relPath)) return;
    visited.add(relPath);
    if (ignoreDirs.some((d) => relPath.includes(`/${d}/`) || relPath.startsWith(`${d}/`))) return;

    const absPath = resolve(srcDir, relPath);
    if (!existsSync(absPath) || extname(absPath) !== '.js') return;

    const src = readFileSync(absPath, 'utf-8');
    const importRe = /(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const spec = m[1];
      if (spec.startsWith('#')) {
        // #-prefixed aliases are bare specifiers to the browser — mark unsafe to preload
        hasBareImport.add(relPath);
        const mapped = resolveAlias(spec);
        if (mapped) crawl(mapped);
      } else if (spec.startsWith('./') || spec.startsWith('../')) {
        const abs = resolve(dirname(resolve(srcDir, relPath)), spec);
        const rel = relative(srcDir, abs.endsWith('.js') ? abs : abs + '.js');
        crawl(rel);
      } else {
        // Bare specifier — mark this module as unsafe to preload
        hasBareImport.add(relPath);
      }
    }
    order.push(relPath);
  }

  crawl(entryFile);
  return { order, hasBareImport };
}

/**
 *
 */
function resolveAlias(spec) {
  const aliases = {
    '#store/': 'store/',
    '#utils/': 'utils/',
    '#atoms/': 'components/atoms/',
    '#molecules/': 'components/molecules/',
    '#organisms/': 'components/organisms/',
    '#templates/': 'components/templates/',
    '#pages/': 'pages/',
  };
  for (const [prefix, dir] of Object.entries(aliases)) {
    if (spec.startsWith(prefix)) return dir + spec.slice(prefix.length);
  }
  return null;
}

/**
 * Inject modulepreload tags into index.html.
 * Vendor files (importmap targets) are preloaded first, then app modules
 * that contain no bare specifier imports.
 * @param {{ projectDir: string, srcDir?: string, outDir?: string, entry?: string, ignore?: string[], hashSuffix?: string }} opts
 * @returns {{ modules: number }}
 */
export function buildModulePreload(opts) {
  const {
    projectDir,
    srcDir = resolve(projectDir, 'src'),
    outDir = resolve(projectDir, 'dist'),
    entry = 'router/index.js',
    ignore = ['vendor', 'deps'],
    hashSuffix = '',
  } = opts;

  const indexPath = resolve(outDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.log('⚠ dist/index.html not found — run build first');
    return { modules: 0 };
  }

  const html0 = readFileSync(indexPath, 'utf-8');
  const importMap = parseImportMap(html0);

  const { order, hasBareImport } = crawlModules(srcDir, entry, ignore);

  // Vendor files from importmap — preload these first (no bare imports inside them)
  const vendorPaths = [...new Set(Object.values(importMap))].filter(
    (v) => v.startsWith('/') && v.includes('.js'),
  );

  // App modules safe to preload — exclude any that directly import a bare specifier
  const appPaths = order.filter((m) => !hasBareImport.has(m));

  const v = hashSuffix ? `?v=${hashSuffix}` : '';
  const tags = [
    ...vendorPaths.map((p) => `  <link rel="modulepreload" href="${p.includes('?') ? p : p + v}">`),
    ...appPaths.map((m) => `  <link rel="modulepreload" href="/${m}${v}">`),
  ].join('\n');

  let html = html0;
  if (html.includes('rel="modulepreload"')) {
    html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
  }
  html = html.replace('</head>', `${tags}\n</head>`);
  writeFileSync(indexPath, html);

  const skipped = hasBareImport.size;
  console.log(
    `✅ Modulepreload: ${vendorPaths.length} vendor + ${appPaths.length} app modules → dist/index.html (${skipped} skipped — bare imports)`,
  );
  return { modules: vendorPaths.length + appPaths.length };
}
