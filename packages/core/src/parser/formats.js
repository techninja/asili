/**
 * Per-format DNA line parsers.
 * Each returns { rsid, chromosome, position, allele1, allele2 } or null.
 * @module packages/core/src/parser/formats
 */

const SKIP_CHROMS = new Set(['0', 'MT', 'XY', '--']);

/**
 * Normalize chromosome value to string.
 * @param {string} chr
 * @returns {string|null}
 */
function normChr(chr) {
  const c = chr.replace(/^chr/i, '').toUpperCase();
  if (SKIP_CHROMS.has(c)) return null;
  return c;
}

/**
 * Validate allele character.
 * @param {string} a
 * @returns {boolean}
 */
function validAllele(a) {
  return /^[ACGTDI-]+$/i.test(a);
}

/** @param {string} line @returns {object|null} */
export function parse23andMe(line) {
  if (line.startsWith('#') || line.startsWith('rsid')) return null;
  const parts = line.split('\t');
  if (parts.length < 4) return null;
  const chr = normChr(parts[1]);
  if (!chr) return null;
  const pos = parseInt(parts[2], 10);
  if (isNaN(pos) || pos <= 0) return null;
  const geno = parts[3].trim();
  const a1 = geno[0] || '-';
  const a2 = geno[1] || a1;
  if (!validAllele(a1) || !validAllele(a2)) return null;
  return { rsid: parts[0], chromosome: chr, position: pos, allele1: a1, allele2: a2 };
}

/** @param {string} line @returns {object|null} */
export function parseAncestryDNA(line) {
  if (line.startsWith('#') || line.startsWith('rsid')) return null;
  const parts = line.split('\t');
  if (parts.length < 5) return null;
  const chr = normChr(parts[1]);
  if (!chr) return null;
  const pos = parseInt(parts[2], 10);
  if (isNaN(pos) || pos <= 0) return null;
  const a1 = parts[3].trim();
  const a2 = parts[4].trim();
  if (!validAllele(a1) || !validAllele(a2)) return null;
  return { rsid: parts[0], chromosome: chr, position: pos, allele1: a1, allele2: a2 };
}

/** @param {string} line @returns {object|null} */
export function parseMyHeritage(line) {
  if (line.startsWith('#') || /^RSID/i.test(line)) return null;
  const sep = line.includes(',') ? ',' : '\t';
  const parts = line.split(sep).map(s => s.replace(/"/g, '').trim());
  if (parts.length < 4) return null;
  const chr = normChr(parts[1]);
  if (!chr) return null;
  const pos = parseInt(parts[2], 10);
  if (isNaN(pos) || pos <= 0) return null;
  const geno = parts[3];
  const a1 = geno[0] || '-';
  const a2 = geno[1] || a1;
  if (!validAllele(a1) || !validAllele(a2)) return null;
  return { rsid: parts[0], chromosome: chr, position: pos, allele1: a1, allele2: a2 };
}

/** @param {string} line @returns {object|null} */
export function parseFamilyTreeDNA(line) {
  if (line.startsWith('#') || /^RSID/i.test(line)) return null;
  const parts = line.split('\t');
  if (parts.length < 5) return null;
  const chr = normChr(parts[1]);
  if (!chr) return null;
  const pos = parseInt(parts[2], 10);
  if (isNaN(pos) || pos <= 0) return null;
  const a1 = parts[3].trim();
  const a2 = parts[4].trim();
  if (!validAllele(a1) || !validAllele(a2)) return null;
  return { rsid: parts[0].trim(), chromosome: chr, position: pos, allele1: a1, allele2: a2 };
}

/** @param {string} line @returns {object|null} */
export function parseVCF(line) {
  if (line.startsWith('#')) return null;
  const parts = line.split('\t');
  if (parts.length < 10) return null;
  const chr = normChr(parts[0]);
  if (!chr) return null;
  const pos = parseInt(parts[1], 10);
  if (isNaN(pos) || pos <= 0) return null;
  const ref = parts[3];
  const alts = parts[4].split(',');
  const gt = (parts[9] || '').split(':')[0];
  const alleles = [ref, ...alts];
  const indices = gt.replace('|', '/').split('/').map(Number);
  const a1 = alleles[indices[0]] || ref;
  const a2 = alleles[indices[1] ?? indices[0]] || ref;
  return { rsid: parts[2] !== '.' ? parts[2] : `${chr}:${pos}`, chromosome: chr, position: pos, allele1: a1, allele2: a2 };
}
