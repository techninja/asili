/**
 * Individual setup — name + emoji picker after DNA parse.
 * Dispatches 'setup-complete' with { name, emoji }.
 * @module components/molecules/individual-setup
 */

import { html, define, dispatch } from 'hybrids';

const EMOJI_OPTIONS = [
  '👤',
  '👩',
  '👨',
  '👧',
  '👦',
  '👶',
  '🧔',
  '👵',
  '👴',
  '🧑',
  '👱',
  '🧑‍🦰',
  '🧑‍🦱',
  '🧑‍🦳',
  '🧬',
];

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
  render: {
    value: ({ name, emoji, variantCount, format }) => html`
      <form class="individual-setup" onsubmit="${handleSubmit}">
        <p class="individual-setup__parsed">
          ✓ ${variantCount.toLocaleString()} variants parsed from ${format}
        </p>
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
          <div class="individual-setup__emojis">
            ${EMOJI_OPTIONS.map(
              (e) => html`
                <button
                  type="button"
                  class="individual-setup__emoji-btn ${e === emoji
                    ? 'individual-setup__emoji-btn--active'
                    : ''}"
                  onclick="${(h) => {
                    h.emoji = e;
                  }}"
                >
                  ${e}
                </button>
              `,
            )}
          </div>
        </div>
        <button type="submit" class="btn btn-primary" disabled="${!name.trim()}">
          Continue & Score
        </button>
      </form>
    `,
    shadow: false,
  },
});
