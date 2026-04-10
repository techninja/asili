/**
 * Individual list molecule — shows saved individuals with actions.
 * Dispatches 'select-individual', 'delete-individual', 'upgrade-individual'.
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
                    <span class="individual-list__name"
                      >${ind.hasImputed ? '⭐ ' : ''}${ind.name}</span
                    >
                    <span class="individual-list__meta">
                      ${ind.variantCount?.toLocaleString() || 0} variants
                      ${ind.hasImputed ? '· Imputed' : ''}
                    </span>
                  </span>
                </button>
                ${!ind.hasImputed ? upgradeBtn(ind) : html``} ${deleteBtn(ind, confirmDelete)}
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} ind */
function upgradeBtn(ind) {
  return html`
    <label class="btn btn-ghost btn-sm individual-list__upgrade">
      ⬆ Upgrade
      <input
        type="file"
        accept=".parquet"
        class="sr-only"
        onchange="${(host, e) => {
          const file = e.target.files?.[0];
          if (file)
            dispatch(host, 'upgrade-individual', { detail: { id: ind.id, file }, bubbles: true });
          e.target.value = '';
        }}"
      />
    </label>
  `;
}

/** @param {object} ind @param {string} confirmId */
function deleteBtn(ind, confirmId) {
  if (confirmId === ind.id) {
    return html`
      <button class="btn btn-danger btn-sm" onclick="${(host) => doDelete(host, ind)}">
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
    `;
  }
  return html`<button
    class="btn btn-ghost btn-sm"
    onclick="${(host) => {
      host.confirmDelete = ind.id;
    }}"
  >
    🗑
  </button>`;
}

/** @param {object & HTMLElement} host @param {object} ind */
async function doDelete(host, ind) {
  try {
    const dl = getDataLayer();
    await dl.deleteIndividual(ind.id);
  } catch (e) {
    console.error(e);
    /* data layer not init */
  }
  host.confirmDelete = '';
  dispatch(host, 'delete-individual', { detail: ind, bubbles: true });
}
