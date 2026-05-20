/**
 * Individual list molecule — shows saved individuals with actions.
 * Inline edit, upgrade, delete. Background progress bar per individual.
 * @module components/molecules/individual-list
 */

import { html, define, dispatch } from 'hybrids';
import { upgradeArea, deleteArea } from './list-actions.js';
import { editArea } from './list-edit.js';
import { subscribe, getState } from '#utils/queue-state.js';

export default define({
  tag: 'individual-list',
  individuals: '',
  activeId: '',
  confirmDelete: '',
  upgradeId: '',
  editId: '',
  editState: { value: /** @type {object|null} */ (null), connect: () => {} },
  _tick: {
    value: 0,
    connect: (host, _key, invalidate) => {
      const unsub = subscribe(() => { host._tick++; invalidate(); });
      return unsub;
    },
  },
  render: {
    value: ({ individuals, activeId, confirmDelete, upgradeId, editId, editState, _tick }) => {
      void _tick;
      const list = individuals ? JSON.parse(individuals) : [];
      if (!list.length) return html`<p class="individual-list__empty">No individuals yet</p>`;
      const state = getState();
      const byInd = state.byIndividual || {};
      return html`
        <div class="individual-list">
          ${list.map((ind) => {
            const progress = byInd[ind.id];
            const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
            const isScoring = state.running && state.currentScoringId === ind.id;
            return html`
              <div
                class="individual-list__item ${ind.id === activeId ? 'individual-list__item--active' : ''} ${isScoring ? 'individual-list__item--scoring' : ''}"
                style="--progress: ${pct}%"
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
            `;
          })}
        </div>
      `;
    },
    shadow: false,
  },
});
