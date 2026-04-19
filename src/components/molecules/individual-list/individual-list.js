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
  upgradeId: '',
  render: {
    value: ({ individuals, activeId, confirmDelete, upgradeId }) => {
      const list = individuals ? JSON.parse(individuals) : [];
      if (!list.length) return html`<p class="individual-list__empty">No individuals yet</p>`;
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
                ${!ind.hasImputed ? upgradeArea(ind, upgradeId) : html``}
                ${deleteArea(ind, confirmDelete)}
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} ind @param {string} expandedId */
function upgradeArea(ind, expandedId) {
  if (expandedId === ind.id) {
    return html`
      <div class="individual-list__upgrade-choices">
        <a
          href="https://impute.asili.dev"
          target="_blank"
          rel="noopener"
          class="btn btn-ghost btn-sm"
        >
          <app-icon name="cloud" size="sm"></app-icon> Impute Service
        </a>
        <label class="btn btn-ghost btn-sm">
          <app-icon name="upload" size="sm"></app-icon> Add File
          <input
            type="file"
            accept=".parquet,.asili"
            class="sr-only"
            onchange="${(host, e) => {
              const file = e.target.files?.[0];
              if (file)
                dispatch(host, 'upgrade-individual', {
                  detail: { id: ind.id, file },
                  bubbles: true,
                });
              e.target.value = '';
              host.upgradeId = '';
            }}"
          />
        </label>
        <button
          class="btn btn-ghost btn-sm"
          onclick="${(host) => {
            host.upgradeId = '';
          }}"
        >
          <app-icon name="x" size="sm"></app-icon>
        </button>
      </div>
    `;
  }
  return html`
    <button
      class="btn btn-ghost btn-sm individual-list__upgrade"
      onclick="${(host) => {
        host.upgradeId = ind.id;
      }}"
    >
      <app-icon name="zap" size="sm"></app-icon> Upgrade
    </button>
  `;
}

/** @param {object} ind @param {string} confirmId */
function deleteArea(ind, confirmId) {
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
  return html`
    <button
      class="btn btn-ghost btn-sm"
      onclick="${(host) => {
        host.confirmDelete = ind.id;
      }}"
    >
      <app-icon name="trash" size="sm"></app-icon>
    </button>
  `;
}

/** @param {object & HTMLElement} host @param {object} ind */
async function doDelete(host, ind) {
  try {
    const dl = getDataLayer();
    await dl.deleteIndividual(ind.id);
  } catch (e) {
    console.error(e);
  }
  host.confirmDelete = '';
  dispatch(host, 'delete-individual', { detail: ind, bubbles: true });
}
