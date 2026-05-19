/**
 * Emoji builder — construct a person emoji from gender, skin, style, and role.
 * Dispatches 'emoji-change' with the built emoji string.
 * @module components/molecules/emoji-builder
 */

import { html, define, dispatch } from 'hybrids';
import { BASES, BASE_LABELS, SKIN_COLORS, STYLES, HAIRS, ROLES, build } from './emoji-data.js';

/**
 *
 */
function getEmoji(host) {
  return build(host.gender, host.skin, host.style, host.hair, host.role);
}

export default define({
  tag: 'emoji-builder',
  gender: 0,
  skin: 0,
  style: 0,
  hair: -1,
  role: -1,
  _init: {
    value: false,
    connect() {},
  },
  render: {
    value: ({ gender, skin, style, hair, role }) => html`
      <div class="emoji-builder">
        <div class="emoji-builder__row">
          ${BASES.map(
            (_, i) => html`
              <button
                type="button"
                class="emoji-builder__opt ${gender === i ? 'emoji-builder__opt--sel' : ''}"
                onclick="${(host) => {
                  host.role = -1;
                  setVal(host, 'gender', i);
                }}"
              >
                ${BASE_LABELS[i]}
              </button>
            `,
          )}
          <span class="emoji-builder__sep"></span>
          ${SKIN_COLORS.map(
            (c, i) => html`
              <button
                type="button"
                class="emoji-builder__dot ${skin === i ? 'emoji-builder__dot--sel' : ''}"
                style="background: ${c}"
                onclick="${(host) => setVal(host, 'skin', i)}"
              ></button>
            `,
          )}
        </div>
        <div class="emoji-builder__row">
          ${STYLES.map(
            (s, i) => html`
              <button
                type="button"
                class="emoji-builder__opt ${role < 0 && hair < 0 && style === i
                  ? 'emoji-builder__opt--sel'
                  : ''}"
                onclick="${(host) => {
                  host.hair = -1;
                  host.role = -1;
                  setVal(host, 'style', i);
                }}"
              >
                ${s.icon}
              </button>
            `,
          )}
          ${HAIRS.map(
            (h, i) => html`
              <button
                type="button"
                class="emoji-builder__opt ${hair === i ? 'emoji-builder__opt--sel' : ''}"
                onclick="${(host) => {
                  host.role = -1;
                  setVal(host, 'hair', host.hair === i ? -1 : i);
                }}"
              >
                ${h.icon}
              </button>
            `,
          )}
        </div>
        <div class="emoji-builder__row">
          ${ROLES.map(
            (r, i) => html`
              <button
                type="button"
                class="emoji-builder__opt ${role === i ? 'emoji-builder__opt--sel' : ''}"
                onclick="${(host) => {
                  host.hair = -1;
                  setVal(host, 'role', host.role === i ? -1 : i);
                }}"
              >
                ${r.icon}
              </button>
            `,
          )}
        </div>
      </div>
    `,
    shadow: false,
  },
});

/**
 *
 */
function setVal(host, key, val) {
  host[key] = val;
  const emoji = getEmoji(host);
  const params = `${host.gender},${host.skin},${host.style},${host.hair},${host.role}`;
  dispatch(host, 'emoji-change', { detail: { emoji, params }, bubbles: true });
}
