/**
 * Asili core scoring library.
 * Pure functions, no DOM, no framework — runs in Node and browser.
 * @module packages/core
 */

export {
  calculateZScore, calculatePercentile, estimateTheoreticalSD,
  calculateConfidence, calculateQualityScore,
} from './src/calculator.js';

export { normalizePGS, selectBestPGS } from './src/normalizer.js';

export { scoreFromMatches, finalize } from './src/scorer.js';

export {
  positionKey, resolveAlleleDosage, countEffectAlleles, buildPositionMap,
} from './src/matcher.js';

export { formatTraitValue } from './src/formatter.js';
