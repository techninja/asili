/**
 * Trait card renderer for the trait grid.
 * @module components/organisms/trait-grid/render-card
 */

import { html, router } from 'hybrids';
import { results } from '#pages/beta/results-store.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';

/** @param {object} t @param {number} rc @param {boolean} scoring */
export function renderCard(t, rc, scoring) {
  const r = results[t.trait_id];
  const fmt =
    r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
  return html`
    <a href="${router.url(TraitDetailView, { traitId: t.trait_id })}" class="trait-grid__link">
      <trait-card
        emoji="${t.emoji || '🧬'}"
        name="${t.name}"
        traitType="${t.trait_type || 'quantitative'}"
        percentile="${r?.percentile || 0}"
        confidence="${r?.confidence || ''}"
        value="${fmt?.display || ''}"
        unit="${fmt?.unit || ''}"
        scored="${r ? true : false}"
        scoring="${scoring}"
        hasIndividual="${rc > 0 || scoring}"
      ></trait-card>
    </a>
  `.key(`${t.trait_id}:${r ? rc : 0}`);
}
