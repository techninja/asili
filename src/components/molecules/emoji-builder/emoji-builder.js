/**
 * Emoji builder — construct a person emoji from gender, skin, and style.
 * Dispatches 'emoji-change' with the built emoji string.
 * @module components/molecules/emoji-builder
 */

import { html, define, dispatch } from 'hybrids';

const ZWJ = '\u200D';
const VS16 = '\uFE0F';
const SKINS = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const SKIN_COLORS = ['#FFCC4D', '#FADCBC', '#E0BB95', '#BF8B68', '#9B643D', '#594539'];
const BASES = ['\u{1F468}', '\u{1F469}', '\u{1F9D1}'];
const STYLES = [
  { icon: '\u{1F9D1}', bases: ['\u{1F468}', '\u{1F469}', '\u{1F9D1}'], sign: false },
  { icon: '\u{1F471}', bases: ['\u{1F471}', '\u{1F471}', '\u{1F471}'], sign: true },
  { icon: '\u{1F9D4}', bases: ['\u{1F9D4}', '\u{1F9D4}', '\u{1F9D4}'], sign: true },
  { icon: '\u{1F9D3}', bases: ['\u{1F474}', '\u{1F475}', '\u{1F9D3}'], sign: false },
];
const HAIRS = [
  { icon: '\u{1F9B0}', mod: '\u{1F9B0}' },
  { icon: '\u{1F9B1}', mod: '\u{1F9B1}' },
  { icon: '\u{1F9B3}', mod: '\u{1F9B3}' },
  { icon: '\u{1F9B2}', mod: '\u{1F9B2}' },
];

/** @param {number} g @param {number} s @param {number} st @param {number} h */
function build(g, s, st, h) {
  if (h >= 0) return BASES[g] + SKINS[s] + ZWJ + HAIRS[h].mod;
  const style = STYLES[st];
  let e = style.bases[g] + SKINS[s];
  if (style.sign && g < 2) e += ZWJ + (g === 0 ? `\u2642${VS16}` : `\u2640${VS16}`);
  return e;
}

/** @param {object & HTMLElement} host */
function getEmoji(host) {
  return build(host.gender, host.skin, host.style, host.hair);
}

export default define({
  tag: 'emoji-builder',
  gender: 0,
  skin: 0,
  style: 0,
  hair: -1,
  render: {
    value: ({ gender, skin, style, hair }) => {
      const emoji = build(gender, skin, style, hair);
      return html`
        <div class="emoji-builder">
          <div class="emoji-builder__preview">${emoji}</div>
          <div class="emoji-builder__row">
            <span class="emoji-builder__label">Gender</span>
            ${BASES.map(
              (b, i) => html`
                <button
                  type="button"
                  class="emoji-builder__opt ${gender === i ? 'emoji-builder__opt--sel' : ''}"
                  onclick="${(host) => setVal(host, 'gender', i)}"
                >
                  ${b}
                </button>
              `,
            )}
          </div>
          <div class="emoji-builder__row">
            <span class="emoji-builder__label">Skin</span>
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
            <span class="emoji-builder__label">Style</span>
            ${STYLES.map(
              (s, i) => html`
                <button
                  type="button"
                  class="emoji-builder__opt ${hair < 0 && style === i
                    ? 'emoji-builder__opt--sel'
                    : ''}"
                  onclick="${(host) => {
                    host.hair = -1;
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
                  onclick="${(host) => setVal(host, 'hair', host.hair === i ? -1 : i)}"
                >
                  ${h.icon}
                </button>
              `,
            )}
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object & HTMLElement} host @param {string} key @param {number} val */
function setVal(host, key, val) {
  host[key] = val;
  dispatch(host, 'emoji-change', { detail: getEmoji(host), bubbles: true });
}
