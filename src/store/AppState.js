/**
 * App state — singleton, localStorage-backed. No server needed.
 * @module store/AppState
 */

import { store } from 'hybrids';

/** @typedef {{ theme: 'light'|'dark', count: number }} AppState */

/** @type {import('hybrids').Model<AppState>} */
const AppState = {
  theme: 'dark',
  count: 0,
  [store.connect]: {
    get: () => {
      const raw = localStorage.getItem('appState');
      return raw ? JSON.parse(raw) : {};
    },
    set: (id, values) => {
      localStorage.setItem('appState', JSON.stringify(values));
      return values;
    },
  },
};

export default AppState;
