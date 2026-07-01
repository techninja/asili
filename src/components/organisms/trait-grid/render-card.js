/**
 * Trait card renderer + family cache for mini-curve markers.
 * @module components/organisms/trait-grid/render-card
 */

import { html, router } from 'hybrids';
import { results, getActiveId } from '#pages/app/results-store.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import { traitCategory } from './helpers.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';

let familyCache = {};
let activeEmoji = '\u{1F464}';
let showFamily = false;

/**
 *
 */
export function clearFamilyCache() {
  familyCache = {};
  activeEmoji = '\u{1F464}';
}
/**
 *
 */
export function setShowFamily(val) {
  showFamily = val;
}
/**
 *
 */
export function getShowFamily() {
  return showFamily;
}
/**
 *
 */
export function hasFamilyScore(traitId) {
  return !!familyCache[traitId]?.length;
}

/** @param {object} t @param {number} rc @param {boolean} scoring */
export function renderCard(t, rc, scoring) {
  const r = results[t.trait_id];
  const det = r?.bestPGS && r?.pgsDetails?.[r.bestPGS];
  const displayValue = computeCardValue(r, t, det);
  const fmt =
    displayValue !== null && t.value_display !== 'percentile_only'
      ? formatTraitValue(displayValue, t.unit)
      : null;
  const markers = showFamily ? familyCache[t.trait_id] : null;
  const markersJson = markers?.length ? JSON.stringify(markers) : '';
  const cov = det?.coverage ?? 0;
  return html`
    <a
      href="${router.url(TraitDetailView, { traitId: t.trait_id })}"
      class="trait-grid__link"
      onclick="${() => sessionStorage.setItem('asili-source-tab', 'traits')}"
    >
      <trait-card
        emoji="${t.emoji || '\u{1F9EC}'}"
        name="${t.name}"
        traitType="${t.trait_type || 'quantitative'}"
        percentile="${r?.percentile || 0}"
        confidence="${r?.confidence || ''}"
        value="${fmt?.display || ''}"
        unit="${fmt?.unit || ''}"
        scored="${r ? true : false}"
        scoring="${scoring}"
        hasIndividual="${rc > 0 || scoring}"
        indEmoji="${activeEmoji}"
        markers="${markersJson}"
        coverage="${Math.round(cov * 100)}"
        category="${traitCategory(t)}"
      ></trait-card>
    </a>
  `;
}

/** Load active individual's emoji. */
export async function loadActiveEmoji() {
  try {
    await idb.openDB();
    const id = getActiveId();
    const individuals = await idb.getAll('individuals');
    const active = individuals.find((i) => i.id === id);
    if (active) activeEmoji = active.emoji || '\u{1F464}';
  } catch {
    /* */
  }
}

/** Load other individuals' results into familyCache for mini-curve markers. */
export async function loadFamilyCache() {
  familyCache = {};
  try {
    await idb.openDB();
    const activeId = getActiveId();
    const individuals = await idb.getAll('individuals');
    const active = individuals.find((i) => i.id === activeId);
    if (active) activeEmoji = active.emoji || '\u{1F464}';
    const others = individuals.filter((i) => i.id !== activeId);
    if (others.length === 0) return;
    const keys = await idb.getAllKeys('results');
    for (const ind of others) {
      const prefix = `${ind.id}:`;
      for (const k of keys) {
        if (!String(k).startsWith(prefix)) continue;
        const tid = String(k).slice(prefix.length);
        const r = await idb.get('results', k);
        if (r?.percentile !== null && r?.percentile !== undefined) {
          if (!familyCache[tid]) familyCache[tid] = [];
          familyCache[tid].push({ e: ind.emoji || '\u{1F464}', p: Math.round(r.percentile) });
        }
      }
    }
  } catch (e) {
    console.error('loadFamilyCache:', e);
  }
}

/** Compute display value from stored result or retroactively from z-score. */
function computeCardValue(r, t, det) {
  if (r?.value !== null && r?.value !== undefined) return r.value;
  if (!det?.zScore || !t?.phenotype_mean || !t?.phenotype_sd) return null;
  const r2 = det.performanceMetric || 0.05;
  return t.phenotype_mean + det.zScore * Math.sqrt(r2) * t.phenotype_sd;
}
