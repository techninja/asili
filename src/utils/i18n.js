/**
 * i18n — 4-layer message cascade.
 *
 * Resolution order (last wins):
 * 1. App defaults (English, defined in this file)
 * 2. Locale file (/locales/<lang>.json)
 * 3. Project overrides (/locales/overrides.json)
 * 4. Project locale overrides (/locales/overrides.<lang>.json)
 *
 * Usage:
 *   import { t, loadLocale } from '#utils/i18n.js';
 *   await loadLocale(navigator.language); // call once at app init
 *   t('general.loading')                 // → 'Loading…'
 *   t('greeting', { name: 'James' })     // → 'Hello, James!'
 *
 * Key convention: component.action or domain.concept
 * Add app-specific defaults below and override per-project in overrides.json.
 * @module utils/i18n
 */

/** @type {Record<string, string>} */
const DEFAULTS = {
  'general.loading': 'Loading…',
  'general.error': 'Something went wrong.',
  'general.retry': 'Try again',
  'general.back': 'Back',
  'general.close': 'Close',
  'general.save': 'Save',
  'general.cancel': 'Cancel',
  'general.confirm': 'Confirm',
  'general.noResults': 'No results found.',
  'nav.home': 'Home',
  'error.notFound': 'Page not found.',
  'error.offline': 'You appear to be offline.',
};

/** @type {Record<string, string>} */
let active = { ...DEFAULTS };

/** @param {string} url @returns {Promise<Record<string, string>>} */
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

/**
 * Load and merge all i18n layers. Call once on app init.
 * @param {string} [locale] - BCP 47 locale string e.g. 'es', 'es-MX'
 */
export async function loadLocale(locale) {
  const lang = locale?.split('-')[0] || '';
  const isEnglish = !lang || lang === 'en';

  const [localeStrings, overrides, localeOverrides] = await Promise.all([
    isEnglish ? {} : fetchJson(`/locales/${lang}.json`),
    fetchJson('/locales/overrides.json'),
    isEnglish ? {} : fetchJson(`/locales/overrides.${lang}.json`),
  ]);

  active = { ...DEFAULTS, ...localeStrings, ...overrides, ...localeOverrides };
}

/**
 * Get a translated string with optional {param} interpolation.
 * Falls back to the key itself if not found.
 * @param {string} key
 * @param {Record<string, string>} [params]
 * @returns {string}
 */
export function t(key, params) {
  let msg = active[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, v);
    }
  }
  return msg;
}

/** @returns {string} Active locale language code e.g. 'en', 'es' */
export function getLocale() {
  return navigator.language?.split('-')[0] || 'en';
}
