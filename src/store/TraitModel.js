/**
 * Trait store model — metadata from the trait manifest.
 * Loaded once on startup, read-only in the UI.
 * @module store/TraitModel
 */

import { store } from 'hybrids';

/**
 * @typedef {object} Trait
 * @property {string} id
 * @property {string} traitId
 * @property {string} name
 * @property {string} emoji
 * @property {string} traitType
 * @property {string|null} unit
 * @property {number} pgsCount
 * @property {string} filePath
 * @property {string[]} categories
 * @property {string} description
 * @property {number} phenotypeMean
 * @property {number} phenotypeSd
 */

/** @type {import('hybrids').Model<Trait>} */
const TraitModel = {
  id: true,
  traitId: '',
  name: '',
  emoji: '🧬',
  traitType: 'disease_risk',
  unit: '',
  pgsCount: 0,
  filePath: '',
  categories: [String],
  description: '',
  phenotypeMean: 0,
  phenotypeSd: 0,
  [store.connect]: {
    get: (id) => {
      const raw = localStorage.getItem(`trait:${id}`);
      return raw ? JSON.parse(raw) : { id };
    },
    list: () => {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('trait:')) {
          items.push(JSON.parse(localStorage.getItem(key)));
        }
      }
      return items;
    },
  },
};

export default TraitModel;
