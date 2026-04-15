#!/usr/bin/env node

/**
 * Extracts SVG path data from lucide-static for icons used in the app.
 * Generates src/icons.json — loaded by app-icon at runtime.
 * Runs on `npm postinstall`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ICONS_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT = resolve(ROOT, 'src/icons.json');

/** Icons used in the app — lucide name → app name */
const ICON_MAP = {
  plus: 'plus',
  check: 'check',
  'trash-2': 'trash',
  x: 'x',
  pencil: 'edit',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',
  folder: 'folder',
  'grip-vertical': 'grip',
  list: 'list',
  'layout-grid': 'grid',
  filter: 'filter',
  settings: 'settings',
  'mouse-pointer': 'pointer',
  'pen-tool': 'pen',
  square: 'rect',
  circle: 'circle',
  minus: 'line',
  shapes: 'shapes',
  cloud: 'cloud',
  database: 'database',
  diamond: 'diamond',
  hexagon: 'hexagon',
  'file-text': 'document',
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  cylinder: 'cylinder',
  server: 'server',
  monitor: 'monitor',
  globe: 'globe',
  lock: 'lock',
  shield: 'shield',
  user: 'user',
  cpu: 'cpu',
  wifi: 'wifi',
  zap: 'zap',
  box: 'box',
  star: 'star',
  type: 'text',
  // Trait detail section icons
  gauge: 'gauge',
  award: 'award',
  scale: 'scale',
  target: 'target',
  dna: 'dna',
  'git-compare': 'compare',
  'chart-bar-stacked': 'chart-stacked',
  activity: 'activity',
  'bar-chart-3': 'bar-chart',
  'chart-pie': 'chart-pie',
  info: 'info',
  'triangle-alert': 'alert',
  'circle-help': 'help',
  sparkles: 'sparkles',
  microscope: 'microscope',
  beaker: 'beaker',
  atom: 'atom',
  'heart-pulse': 'heart-pulse',
  brain: 'brain',
  percent: 'percent',
  layers: 'layers',
  // Header icons
  sun: 'sun',
  moon: 'moon',
  // Navigation
  'step-back': 'step-back',
  'step-forward': 'step-forward',
  'user-plus': 'user-plus',
  'filter-x': 'filter-x',
  'arrow-up-down': 'sort',
  'arrow-down-wide-narrow': 'sort-desc',
  'arrow-up-narrow-wide': 'sort-asc',
};

/**
 * Extract all <path>, <line>, <circle>, <rect>, <polyline> inner content from an SVG file.
 * @param {string} file
 * @returns {string} Combined SVG inner elements
 */
function extractInner(file) {
  const svg = readFileSync(file, 'utf-8');
  const inner = svg.match(/<(path|line|circle|rect|polyline|ellipse)\s[^>]*\/>/g);
  return inner ? inner.join('') : '';
}

mkdirSync(dirname(OUT), { recursive: true });

/** @type {Record<string, string>} */
const icons = {};
let count = 0;

for (const [lucideName, appName] of Object.entries(ICON_MAP)) {
  const file = resolve(ICONS_DIR, `${lucideName}.svg`);
  if (!existsSync(file)) {
    console.warn(`⚠ Icon not found: ${lucideName}`);
    continue;
  }
  icons[appName] = extractInner(file);
  count++;
}

writeFileSync(OUT, JSON.stringify(icons, null, 2));
console.log(`✓ Built ${count} icons → src/icons.json`);
