/**
 * Individual list action areas — upgrade, delete.
 * @module components/molecules/individual-list/list-actions
 */

import { html, dispatch } from 'hybrids';
import { getDataLayer } from '/packages/core/src/data-layer/create.js';

/** @param {object} ind @param {string} expandedId */
export function upgradeArea(ind, expandedId) {
  if (expandedId === ind.id) {
    return html`
      <div class="individual-list__upgrade-choices">
        <a
          href="https://impute.asili.dev"
          target="_blank"
          rel="noopener"
          class="btn btn-ghost btn-sm"
        >
          <app-icon name="cloud" size="sm"></app-icon> Impute
        </a>
        <label class="btn btn-ghost btn-sm">
          <app-icon name="upload" size="sm"></app-icon> File
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
      <app-icon name="zap" size="sm"></app-icon>
    </button>
  `;
}

/** @param {object} ind @param {string} confirmId */
export function deleteArea(ind, confirmId) {
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
      title="Rescore"
      onclick="${(host) => doRescore(host, ind)}"
    >
      <app-icon name="refresh" size="sm"></app-icon>
    </button>
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

/**
 *
 */
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

/**
 * Clear results and re-trigger scoring for an individual.
 */
async function doRescore(host, ind) {
  try {
    const dl = getDataLayer();
    await dl.clearResults(ind.id);
  } catch (e) {
    console.error(e);
  }
  dispatch(host, 'rescore-individual', { detail: ind, bubbles: true });
}
