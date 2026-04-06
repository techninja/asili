/**
 * Individual setup — name + emoji builder after DNA parse.
 * Dispatches 'setup-complete' with { name, emoji }.
 * Dispatches 'setup-cancel' when user cancels.
 * @module components/molecules/individual-setup
 */

import { html, define, dispatch } from 'hybrids';
// @ts-ignore
import '../emoji-builder/emoji-builder.js';

/** @param {object & HTMLElement} host */
function handleSubmit(host, e) {
  e.preventDefault();
  if (!host.name.trim()) return;
  dispatch(host, 'setup-complete', {
    detail: { name: host.name.trim(), emoji: host.emoji },
    bubbles: true,
  });
}

export default define({
  tag: 'individual-setup',
  name: '',
  emoji: '👤',
  variantCount: 0,
  format: '',
  filename: '',
  render: {
    value: ({ name, emoji, variantCount, format, filename }) => html`
      <div class="individual-setup">
        <div class="individual-setup__status">
          <p class="individual-setup__parsed">
            ✓ ${variantCount.toLocaleString()} variants parsed from ${format}
          </p>
          ${filename ? html`<p class="individual-setup__file">📄 ${filename}</p>` : html``}
        </div>
        <form class="individual-setup__form" onsubmit="${handleSubmit}">
          <label class="individual-setup__label">
            Name
            <input
              type="text"
              class="individual-setup__input"
              placeholder="e.g. Sarah"
              value="${name}"
              oninput="${(h, e) => {
                h.name = e.target.value;
              }}"
              autofocus
            />
          </label>
          <div class="individual-setup__emoji-section">
            <span class="individual-setup__label">Avatar</span>
            <emoji-builder
              onemoji-change="${(host, e) => {
                host.emoji = e.detail;
              }}"
            ></emoji-builder>
          </div>
          <div class="individual-setup__actions">
            <button type="submit" class="btn btn-primary" disabled="${!name.trim()}">
              Continue & Score
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              onclick="${(host) => dispatch(host, 'setup-cancel', { bubbles: true })}"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    `,
    shadow: false,
  },
});
