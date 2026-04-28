/**
 * Individual list molecule — shows saved individuals with actions.
 * Inline edit, upgrade, delete.
 * @module components/molecules/individual-list
 */

import { html, define, dispatch } from 'hybrids';
import { upgradeArea, deleteArea } from './list-actions.js';
import { editArea } from './list-edit.js';

export default define({
  tag: 'individual-list',
  individuals: '',
  activeId: '',
  confirmDelete: '',
  upgradeId: '',
  editId: '',
  editState: { value: /** @type {object|null} */ (null), connect: () => {} },
  render: {
    value: ({ individuals, activeId, confirmDelete, upgradeId, editId, editState }) => {
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
                <button
                  class="btn btn-ghost btn-sm"
                  onclick="${(host) => {
                    host.editId = host.editId === ind.id ? '' : ind.id;
                    host.editState = { name: ind.name, emoji: ind.emoji };
                  }}"
                >
                  <app-icon name="edit" size="sm"></app-icon>
                </button>
                ${deleteArea(ind, confirmDelete)} ${editArea(ind, editId, editState)}
              </div>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});
