/**
 * CSS bundler — recursively resolves @import chains and writes a single
 * flat app.css into the dist output. Replaces the <link> tag in index.html.
 * @module lib/build-css
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Recursively inline all @import statements, resolving relative to the
 * importing file. Each file is included at most once (deduplication).
 * @param {string} filePath  Absolute path to the CSS file
 * @param {Set<string>} seen Already-included paths
 * @returns {string}
 */
function inlineImports(filePath, seen = new Set()) {
  if (seen.has(filePath)) return '';
  seen.add(filePath);

  if (!existsSync(filePath)) {
    console.warn(`  ⚠ CSS import not found: ${filePath}`);
    return '';
  }

  const src = readFileSync(filePath, 'utf-8');
  return src.replace(/@import\s+['"]([^'"]+)['"]\s*;/g, (_, spec) => {
    const abs = resolve(dirname(filePath), spec);
    return inlineImports(abs, seen);
  });
}

/**
 * Bundle all CSS @imports from an entry file into a single flat file.
 * Updates index.html to reference the bundled file.
 * @param {{ projectDir: string, srcDir?: string, outDir?: string, entry?: string, out?: string }} opts
 * @returns {{ bytes: number }}
 */
export function buildCSS(opts) {
  const {
    projectDir,
    srcDir = resolve(projectDir, 'src'),
    outDir = resolve(projectDir, 'dist'),
    entry = 'styles/components.css',
    out = 'styles/app.css',
  } = opts;

  const entryPath = resolve(outDir, entry);
  const outPath = resolve(outDir, out);

  if (!existsSync(entryPath)) {
    console.warn(`⚠ CSS entry not found: ${entryPath}`);
    return { bytes: 0 };
  }

  const css = inlineImports(entryPath);
  writeFileSync(outPath, css);

  // Update index.html: swap the entry <link> for the bundled one
  const indexPath = resolve(outDir, 'index.html');
  if (existsSync(indexPath)) {
    let html = readFileSync(indexPath, 'utf-8');
    html = html.replace(`/${entry}`, `/${out}`);
    writeFileSync(indexPath, html);
  }

  const bytes = Buffer.byteLength(css);
  console.log(`✅ CSS bundle: ${(bytes / 1024).toFixed(1)} KB → dist/${out}`);
  return { bytes };
}
