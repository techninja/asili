/**
 * DNA file parser — detects format and parses to uniform variant array.
 * Pure function, no DOM, works in Node and browser/Worker.
 * @module packages/core/src/parser/parse
 */

import { detectFormat } from './detect.js';
import {
  parse23andMe, parseAncestryDNA, parseMyHeritage,
  parseFamilyTreeDNA, parseVCF,
} from './formats.js';

/** @type {Record<string, Function>} */
const PARSERS = {
  '23andMe': parse23andMe,
  AncestryDNA: parseAncestryDNA,
  MyHeritage: parseMyHeritage,
  FamilyTreeDNA: parseFamilyTreeDNA,
  VCF: parseVCF,
};

/**
 * Parse a DNA file string into uniform variants.
 * @param {string} text - Full file contents
 * @param {(progress: {parsed: number, total: number}) => void} [onProgress]
 * @returns {{ format: string, variants: Array, skipped: number }}
 */
export function parseDNAFile(text, onProgress) {
  const header = text.slice(0, 2048);
  const format = detectFormat(header);
  const parser = PARSERS[format];

  if (!parser) {
    return { format: 'unknown', variants: [], skipped: 0 };
  }

  const lines = text.split('\n');
  const total = lines.length;
  const variants = [];
  let skipped = 0;
  const BATCH = 50000;

  for (let i = 0; i < total; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const v = parser(line);
    if (v) {
      variants.push(v);
    } else if (!line.startsWith('#') && !line.startsWith('rsid') && !line.startsWith('RSID')) {
      skipped++;
    }
    if (onProgress && i % BATCH === 0) {
      onProgress({ parsed: variants.length, total });
    }
  }

  if (onProgress) {
    onProgress({ parsed: variants.length, total });
  }

  return { format, variants, skipped };
}
