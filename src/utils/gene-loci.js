/**
 * Gene loci accessor — reads from cached catalog on window.
 * @module utils/gene-loci
 */

/** Get gene loci from cached catalog (if available). */
export async function getGeneLoci() {
  try {
    if (typeof window !== 'undefined' && /** @type {any} */ (window).__asiliGeneCatalog) {
      return /** @type {any} */ (window).__asiliGeneCatalog.genes.map((g) => ({
        symbol: g.symbol,
        chr: g.chr,
        start: g.start,
        end: g.end,
      }));
    }
  } catch {
    /* not in browser */
  }
  return [];
}
