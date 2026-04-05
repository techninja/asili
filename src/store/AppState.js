/**
 * App state — singleton, localStorage-backed.
 * @module store/AppState
 */

import { store } from 'hybrids';

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
      const raw = localStorage.getItem('appState');
      return raw ? JSON.parse(raw) : {};
    },
    set: (_id, values) => {
      localStorage.setItem('appState', JSON.stringify(values));
      return values;
    },
  },
};

export default AppState;
