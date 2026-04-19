/**
 * App state — singleton, localStorage-backed.
 * @module store/AppState
 */

import { store } from 'hybrids';
import { get, set } from '#utils/storage.js';

/**
 * @typedef {object} AppState
 * @property {string} theme
 * @property {string|null} activeIndividualId
 * @property {string} searchQuery
 * @property {string} sortBy
 * @property {string|null} filterCategory
 * @property {number} tier
 * @property {boolean} isProcessing
 * @property {number} queueCurrent
 * @property {number} queueTotal
 */

/** @type {import('hybrids').Model<AppState>} */
const AppState = {
  theme: 'dark',
  activeIndividualId: '',
  searchQuery: '',
  sortBy: 'name',
  filterCategory: '',
  tier: 1,
  isProcessing: false,
  queueCurrent: 0,
  queueTotal: 0,
  [store.connect]: {
    get: () => {
      const raw = get('appState');
      return raw ? JSON.parse(raw) : {};
    },
    set: (_id, values) => {
      set('appState', JSON.stringify(values));
      return values;
    },
  },
};

export default AppState;
