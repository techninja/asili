/**
 * i18n data loader — fetches trait/gene translation packs from CDN.
 * Matches pipeline output: languages.json, {lang}.traits.json, {lang}.genes.json
 *
 * @module utils/i18n-data
 */

import { DATA_BASE } from './data-url.js';

const I18N_BASE = `${DATA_BASE}/i18n`;

let _manifest = null;
let _traits = null;
let _genes = null;
let _lang = null;

/**
 * Detect preferred non-English language.
 * @returns {string|null}
 */
function detectLang() {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const l of langs) {
    const code = l.split('-')[0].toLowerCase();
    if (code !== 'en') return code;
  }
  return null;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

/**
 * Load the languages manifest (tiny, cacheable).
 * @returns {Promise<object|null>}
 */
export async function loadLanguageManifest() {
  if (_manifest) return _manifest;
  _manifest = await fetchJSON(`${I18N_BASE}/languages.json`);
  return _manifest;
}

/**
 * Load trait translations for a language.
 * @param {string} [lang] - override language code
 * @returns {Promise<object|null>}
 */
export async function loadTraitPack(lang) {
  lang = lang || detectLang();
  if (!lang || lang === 'en') return null;
  if (_traits && _lang === lang) return _traits;
  _traits = await fetchJSON(`${I18N_BASE}/${lang}.traits.json`);
  _lang = lang;
  return _traits;
}

/**
 * Load gene translations (lazy — only when gene explorer opens).
 * @param {string} [lang] - override language code
 * @returns {Promise<object|null>}
 */
export async function loadGenePack(lang) {
  lang = lang || _lang || detectLang();
  if (!lang || lang === 'en') return null;
  if (_genes && _genes._meta?.lang === lang) return _genes;
  _genes = await fetchJSON(`${I18N_BASE}/${lang}.genes.json`);
  return _genes;
}

/**
 * Translate a category name.
 * @param {string} cat - English category name
 * @returns {string}
 */
export function translateCategory(cat) {
  return _traits?.categories?.[cat] || cat;
}

/**
 * Translate a trait's editorial fields in-place.
 * Maps editorial_name → name, editorial_description → description.
 * @param {object} trait - trait object from manifest (mutated)
 */
export function translateTrait(trait) {
  if (!_traits?.traits) return;
  const t = _traits.traits[trait.trait_id];
  if (!t) return;
  if (t.editorial_name) {
    trait._name_en = trait.name;
    trait.name = t.editorial_name;
  }
  if (t.editorial_description) {
    trait._description_en = trait.description;
    trait.description = t.editorial_description;
  }
  if (t.score_interpretation) {
    trait.score_interpretation = { ...trait.score_interpretation, ...t.score_interpretation };
  }
}

/**
 * Patch an entire manifest array in-place.
 * @param {Array<object>} traits
 */
export function translateManifest(traits) {
  if (!_traits?.traits) return;
  for (const t of traits) translateTrait(t);
}

/**
 * Translate a gene category name.
 * @param {string} cat - English gene category name
 * @returns {string}
 */
export function translateGeneCategory(cat) {
  return _genes?.categories?.[cat] || cat;
}

/**
 * Translate a social tag.
 * @param {string} tag - English social tag
 * @returns {string}
 */
export function translateSocialTag(tag) {
  return _genes?.social_tags?.[tag] || tag;
}

/**
 * Translate a gene's editorial fields in-place.
 * @param {object} gene - gene object (mutated)
 */
export function translateGene(gene) {
  if (!_genes) return;
  const g = _genes.genes?.[gene.symbol];
  if (g) {
    for (const [k, v] of Object.entries(g)) gene[k] = v;
  }
  if (gene.social_tags && _genes.social_tags) {
    gene._social_tags_en = gene.social_tags;
    gene.social_tags = gene.social_tags.map((t) => _genes.social_tags[t] || t);
  }
}
