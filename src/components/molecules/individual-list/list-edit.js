/**
 * Individual list inline edit — name + emoji builder within the list item.
 * @module components/molecules/individual-list/list-edit
 */

import { html, dispatch } from 'hybrids';
// @ts-ignore
import '#molecules/emoji-builder/emoji-builder.js';

/** @param {object} ind @param {string} editId @param {object} editState */
export function editArea(ind, editId, editState) {
  if (editId !== ind.id) return html``;
  const name = editState?.name ?? ind.name;
  const emoji = editState?.emoji ?? ind.emoji;
  const params = (editState?.emojiParams || ind.emojiParams || '').split(',').map(Number);
  if (editState && editState.ancestry === undefined) editState.ancestry = ind.ancestry || '';
  return html`
    <div class="individual-list__edit">
      <div class="individual-list__edit-top">
        <input
          type="text"
          class="individual-list__edit-input"
          value="${name}"
          placeholder="Name"
          oninput="${(host, e) => {
            host.editState = { ...host.editState, name: e.target.value };
          }}"
        />
        <span class="individual-list__edit-preview">${emoji}</span>
      </div>
      <emoji-builder
        gender="${params[0] || 0}"
        skin="${params[1] || 0}"
        outfit="${params[2] || 0}"
        hair="${params[3] ?? -1}"
        role="${params[4] ?? -1}"
        onemoji-change="${(host, e) => {
          const d = e.detail;
          host.editState = { ...host.editState, emoji: d.emoji || d, emojiParams: d.params || '' };
        }}"
      ></emoji-builder>
      <label class="individual-list__edit-ancestry">
        <app-icon name="earth" size="sm"></app-icon>
        <select
          onchange="${(host, e) => {
            host.editState = { ...host.editState, ancestry: e.target.value };
          }}"
        >
          <option value="" selected="${!editState?.ancestry}">Global (default)</option>
          <option value="NFE" selected="${editState?.ancestry === 'NFE'}">European</option>
          <option value="FIN" selected="${editState?.ancestry === 'FIN'}">Finnish</option>
          <option value="AFR" selected="${editState?.ancestry === 'AFR'}">African</option>
          <option value="EAS" selected="${editState?.ancestry === 'EAS'}">East Asian</option>
          <option value="SAS" selected="${editState?.ancestry === 'SAS'}">South Asian</option>
          <option value="AMR" selected="${editState?.ancestry === 'AMR'}">American</option>
          <option value="ASJ" selected="${editState?.ancestry === 'ASJ'}">Ashkenazi</option>
          <option value="MID" selected="${editState?.ancestry === 'MID'}">Middle Eastern</option>
        </select>
        <span class="individual-list__edit-ancestry-hint">
          Select the ancestry background for this individual for better score normalization. Rescore
          after changing.
        </span>
      </label>
      <div class="individual-list__edit-actions">
        <button
          class="btn btn-ghost btn-sm"
          onclick="${(host) => {
            host.editId = '';
          }}"
        >
          Cancel
        </button>
        <button
          class="btn btn-primary btn-sm"
          onclick="${(host) => saveEdit(host, ind.id)}"
          disabled="${!name?.trim()}"
        >
          <app-icon name="check" size="sm"></app-icon> Save
        </button>
      </div>
    </div>
  `;
}

/**
 *
 */
async function saveEdit(host, indId) {
  const name = host.editState?.name;
  const emoji = host.editState?.emoji;
  if (!name?.trim()) return;
  try {
    const idb = await import('/packages/core/src/data-layer/idb.js');
    await idb.openDB();
    const existing = await idb.get('individuals', indId);
    if (!existing) return;
    await idb.put('individuals', indId, {
      ...existing,
      name: name.trim(),
      emoji,
      emojiParams: host.editState?.emojiParams || '',
      ancestry: host.editState?.ancestry || '',
    });
  } catch (e) {
    console.error('edit save:', e);
  }
  host.editId = '';
  dispatch(host, 'edit-individual', { detail: { id: indId }, bubbles: true });
  window.dispatchEvent(new CustomEvent('asili-individuals-changed'));
}
