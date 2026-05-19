/**
 * DNA file parser — format detection + per-format parsing.
 * @module packages/core/src/parser
 */

export { detectFormat } from './detect.js';
export { parseDNAFile } from './parse.js';
export {
  parse23andMe, parseAncestryDNA, parseMyHeritage,
  parseFamilyTreeDNA, parseVCF,
} from './formats.js';
