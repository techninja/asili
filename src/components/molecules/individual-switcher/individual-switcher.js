/**
 * Individual switcher — button row for switching active individual.
 * Loads individuals from IndexedDB. Dispatches 'switch-individual'.
 * @module components/molecules/individual-switcher
 */

import { html, define, dispatch } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';

export default define({
  tag: 'individual-switcher',
  activeId: '',
  individuals: {
    value: [],
    connect: (host, _key, invalidate) => {
      idb
        .openDB()
        .then(() => idb.getAll('individuals'))
        .then((list) => {
          host.individuals = list;
          invalidate();
        })
        .catch((e) => console.error(e));
    },
  },
  render: {
    value: ({ individuals, activeId }) => {
      const list = Array.isArray(individuals) ? individuals : [];
      if (list.length === 0) return html``;
      if (list.length === 1) {
        const ind = list[0];
        return html`<span class="app-view__ind-single">${ind.emoji} ${ind.name}</span>`;
      }
      return html`
        <div class="individual-switcher">
          ${list.map(
            (ind) => html`
              <button
                class="individual-switcher__btn ${ind.id === activeId
                  ? 'individual-switcher__btn--active'
                  : ''}"
                onclick="${(host) =>
                  dispatch(host, 'switch-individual', { detail: ind.id, bubbles: true })}"
              >
                ${ind.hasImputed ? '⭐' : ''} ${ind.emoji} ${ind.name}
              </button>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});
