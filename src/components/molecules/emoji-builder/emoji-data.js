/**
 * Emoji builder data — bases, styles, hairs, roles, skin tones.
 * @module components/molecules/emoji-builder/emoji-data
 */

const ZWJ = '\u200D';
const VS16 = '\uFE0F';

export const SKINS = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
export const SKIN_COLORS = ['#FFCC4D', '#FADCBC', '#E0BB95', '#BF8B68', '#9B643D', '#594539'];
export const BASES = ['\u{1F468}', '\u{1F469}', '\u{1F9D1}'];
export const BASE_LABELS = ['\u2642', '\u2640', '\u26A5'];

/* prettier-ignore */
export const STYLES = [
  { icon: '\u{1F9D1}', bases: ['\u{1F468}', '\u{1F469}', '\u{1F9D1}'], sign: false },
  { icon: '\u{1F471}', bases: ['\u{1F471}', '\u{1F471}', '\u{1F471}'], sign: true },
  { icon: '\u{1F9D4}', bases: ['\u{1F9D4}', '\u{1F9D4}', '\u{1F9D4}'], sign: true },
  { icon: '\u{1F9D3}', bases: ['\u{1F474}', '\u{1F475}', '\u{1F9D3}'], sign: false },
];

export const HAIRS = [
  { icon: '\u{1F9B0}', mod: '\u{1F9B0}' },
  { icon: '\u{1F9B1}', mod: '\u{1F9B1}' },
  { icon: '\u{1F9B3}', mod: '\u{1F9B3}' },
  { icon: '\u{1F9B2}', mod: '\u{1F9B2}' },
];

/* prettier-ignore */
export const ROLES = [
  { icon: '\uD83D\uDD2C', zwj: '\u2695' + VS16 },
  { icon: '\uD83C\uDF93', zwj: '\u{1F393}' },
  { icon: '\uD83D\uDD27', zwj: '\u{1F527}' },
  { icon: '\uD83C\uDF73', zwj: '\u{1F373}' },
  { icon: '\uD83C\uDFA4', zwj: '\u{1F3A4}' },
  { icon: '\uD83D\uDCBB', zwj: '\u{1F4BB}' },
  { icon: '\uD83D\uDE80', zwj: '\u{1F680}' },
  { icon: '\uD83C\uDFA8', zwj: '\u{1F3A8}' },
  { icon: '\u2708\uFE0F', zwj: '\u2708' + VS16 },
  { icon: '\uD83C\uDF3E', zwj: '\u{1F33E}' },
];

/** Build an emoji from the current selections. */
export function build(g, s, st, h, r) {
  const base = BASES[g] + SKINS[s];
  if (r >= 0) return base + ZWJ + ROLES[r].zwj;
  if (h >= 0) return BASES[g] + SKINS[s] + ZWJ + HAIRS[h].mod;
  const style = STYLES[st];
  let e = style.bases[g] + SKINS[s];
  if (style.sign && g < 2) e += ZWJ + (g === 0 ? `\u2642${VS16}` : `\u2640${VS16}`);
  return e;
}
