/**
 * DNA file format auto-detection.
 * Examines the first few lines to identify the source.
 * @module packages/core/src/parser/detect
 */

/**
 * @typedef {'23andMe'|'AncestryDNA'|'MyHeritage'|'FamilyTreeDNA'|'VCF'|'unknown'} DNAFormat
 */

/**
 * Detect DNA file format from header lines.
 * @param {string} header - First ~2KB of the file
 * @returns {DNAFormat}
 */
export function detectFormat(header) {
  if (header.startsWith('##fileformat=VCF')) return 'VCF';
  if (header.includes('# This data') || header.includes('# rsid')) return '23andMe';
  if (header.includes('rsid\tchromosome\tposition\tallele1\tallele2')) return 'AncestryDNA';
  if (/RSID[,\t]CHROMOSOME/i.test(header) && /ALLELE1/i.test(header)) return 'FamilyTreeDNA';
  if (/RSID[,\t]CHROMOSOME/i.test(header)) return 'MyHeritage';
  return 'unknown';
}
