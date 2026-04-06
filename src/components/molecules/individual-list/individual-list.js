/**
 * Individual list molecule — shows saved individuals with actions.
 * Dispatches 'select-individual' and 'delete-individual' events.
 * @module components/molecules/individual-list
 */

import { html, define, dispatch } from 'hybrids';
import { getDataLayer } from '/packages/core/src/data-layer/create.js';

export default define({
  tag: 'individual-list',
  individuals: '',
  activeId: '',
  confirmDelete: '',
  render: {
    value: ({ individuals, activeId, confirmDelete }) => {
      const list = individuals ? JSON.parse(individuals) : [];
      if (list.length === 0) return html`<p class="individual-list__empty">No individuals yet</p>`;

      return html`
        <div class="individual-list">
          ${list.map(
            (ind) => html`
              <div
                class="individual-list__item ${ind.id === activeId
                  ? 'individual-list__item--active'
                  : ''}"
              >
                <button
                  class="individual-list__select"
                  onclick="${(host) =>
                    dispatch(host, 'select-individual', { detail: ind, bubbles: true })}"
                >
                  <span class="individual-list__emoji">${ind.emoji}</span>
                  <span class="individual-list__info">
                    <span class="individual-list__name">${ind.name}</span>
                    <span class="individual-list__meta">
                      ${ind.variantCount?.toLocaleString() || 0} variants
                    </span>
                  </span>
                </button>
                ${confirmDelete === ind.id
                  ? html`
                      <button
                        class="btn btn-danger btn-sm"
                        onclick="${(host) => doDelete(host, ind)}"
                      >
                        Confirm
                      </button>
                      <button
                        class="btn btn-ghost btn-sm"
                        onclick="${(host) => {
                          host.confirmDelete = '';
                        }}"
                      >
                        Cancel
                      </button>
                    `
                  : html`
                      <button
                        class="btn btn-ghost btn-sm"
                        onclick="${(host) => {
                          host.confirmDelete = ind.id;
                        }}"
                      >
                        🗑
                      </button>
                    `}
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object & HTMLElement} host @param {object} ind */
async function doDelete(host, ind) {
  try {
    const dl = getDataLayer();
    await dl.deleteIndividual(ind.id);
  } catch {
    /* data layer not init — fall back handled by parent */
  }
  host.confirmDelete = '';
  dispatch(host, 'delete-individual', { detail: ind, bubbles: true });
}
