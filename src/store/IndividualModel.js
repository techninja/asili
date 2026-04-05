/**
 * Individual store model — represents an uploaded DNA profile.
 * @module store/IndividualModel
 */

import { store } from 'hybrids';

/**
 * @typedef {object} Individual
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} relationship
 * @property {string} familyName
 * @property {number} variantCount
 * @property {string} status
 * @property {boolean} hasImputed
 */

/** @type {import('hybrids').Model<Individual>} */
const IndividualModel = {
  id: true,
  name: '',
  emoji: '👤',
  relationship: 'self',
  familyName: '',
  variantCount: 0,
  status: 'importing',
  hasImputed: false,
  [store.connect]: {
    get: (id) => {
      const raw = localStorage.getItem(`individual:${id}`);
      return raw ? JSON.parse(raw) : { id };
    },
    set: (id, values) => {
      localStorage.setItem(`individual:${id}`, JSON.stringify(values));
      return values;
    },
    list: () => {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('individual:')) {
          items.push(JSON.parse(localStorage.getItem(key)));
        }
      }
      return items;
    },
  },
};

export default IndividualModel;
