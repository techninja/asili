/**
 * Chromosome genome-position hue mapping.
 * @module pages/gene-detail/chr-colors
 */

/** Approximate chromosome lengths (hg38, Mbp). */
export const CHR_LENGTHS = {
  1: 249,
  2: 242,
  3: 198,
  4: 190,
  5: 182,
  6: 171,
  7: 159,
  8: 145,
  9: 138,
  10: 134,
  11: 135,
  12: 133,
  13: 114,
  14: 107,
  15: 102,
  16: 90,
  17: 83,
  18: 80,
  19: 59,
  20: 64,
  21: 47,
  22: 51,
  X: 156,
  Y: 57,
};

/** Cumulative genome offsets (Mbp) for hue mapping. */
const CHR_OFFSETS = {
  1: 0,
  2: 249,
  3: 491,
  4: 689,
  5: 879,
  6: 1061,
  7: 1232,
  8: 1391,
  9: 1536,
  10: 1674,
  11: 1808,
  12: 1943,
  13: 2076,
  14: 2190,
  15: 2297,
  16: 2399,
  17: 2489,
  18: 2572,
  19: 2652,
  20: 2711,
  21: 2775,
  22: 2822,
  X: 2873,
};

/** Get start/end hue colors for a chromosome's genome range. */
export function chrHueRange(chr) {
  const startOff = (CHR_OFFSETS[chr] || 0) * 1e6;
  const endOff = startOff + (CHR_LENGTHS[chr] || 100) * 1e6;
  return {
    start: `hsl(${(startOff / 3.1e9) * 360}, 70%, 55%)`,
    end: `hsl(${(endOff / 3.1e9) * 360}, 70%, 55%)`,
  };
}
