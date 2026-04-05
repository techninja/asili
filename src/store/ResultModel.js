/**
 * Result store model — cached scoring result per individual + trait.
 * Key format: "{individualId}:{traitId}"
 * @module store/ResultModel
 */

import { store } from 'hybrids';

/**
 * @typedef {object} Result
 * @property {string} id
 * @property {number|null} zScore
 * @property {number|null} percentile
 * @property {string} confidence
 * @property {string|null} bestPGS
 * @property {number} matchedVariants
 * @property {number} totalVariants
 * @property {string|null} calculatedAt
 * @property {number|null} value
 * @property {string|null} unit
 * @property {number} bestPGSQualityScore
 */

/** @type {import('hybrids').Model<Result>} */
const ResultModel = {
  id: true,
  zScore: 0,
  percentile: 0,
  confidence: 'none',
  bestPGS: '',
  bestPGSQualityScore: 0,
  matchedVariants: 0,
  totalVariants: 0,
  calculatedAt: '',
  value: 0,
  unit: '',
  [store.connect]: {
    get: (id) => {
      const raw = localStorage.getItem(`result:${id}`);
      return raw ? JSON.parse(raw) : { id };
    },
    set: (id, values) => {
      localStorage.setItem(`result:${id}`, JSON.stringify(values));
      return values;
    },
    list: () => {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('result:')) {
          items.push(JSON.parse(localStorage.getItem(key)));
        }
      }
      return items;
    },
  },
};

export default ResultModel;
