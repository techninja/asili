/**
 * Trait detail view — full result for one trait + one individual.
 * Includes individual switcher to compare across people.
 * @module pages/trait-detail
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '../../components/atoms/percentile-bar/percentile-bar.js';
// @ts-ignore
import '../../components/atoms/confidence-badge/confidence-badge.js';
// @ts-ignore
import '../../components/molecules/pgs-table/pgs-table.js';
// @ts-ignore
import '../../components/molecules/family-compare/family-compare.js';
// @ts-ignore
import '../../components/molecules/individual-switcher/individual-switcher.js';
import { results, getActiveId, loadResults } from '../beta/results-store.js';
import { getTraitList } from '../../utils/manifest.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import { buildPgsEntries, loadFamily } from './trait-detail-helpers.js';

export default define({
  tag: 'trait-detail-view',
  [router.connect]: { url: '/trait/:traitId' },
  traitId: '',
  activeId: { value: '', connect: () => {} },
  resultVersion: { value: 0, connect: () => {} },
  trait: {
    value: /** @type {object|null} */ (null),
    connect: (host, _key, invalidate) => {
      host.activeId = getActiveId();
      getTraitList().then((list) => {
        host.trait = list.find((t) => t.trait_id === host.traitId) || null;
        invalidate();
      });
    },
  },
  familyData: {
    value: /** @type {Array<object>} */ ([]),
    connect: (host, _key, invalidate) => {
      loadFamily(host).then(invalidate);
    },
  },
  render: {
    value: ({ traitId, trait, activeId, resultVersion, familyData }) => {
      void resultVersion;
      const r = results[traitId];
      const name = trait?.name || traitId;
      const emoji = trait?.emoji || '🧬';

      return html`
        <div class="trait-detail">
          <div class="trait-detail__nav">
            <a href="/beta" class="trait-detail__back">← Back</a>
            <individual-switcher
              activeId="${activeId}"
              onswitch-individual="${handleSwitch}"
            ></individual-switcher>
          </div>
          <h1 class="trait-detail__title">${emoji} ${name}</h1>
          ${trait?.description
            ? html`<p class="trait-detail__desc">${trait.description}</p>`
            : html``}
          ${r ? scoredContent(r, trait) : noResultMsg()}
          ${familyData.length > 0
            ? html`
                <section class="trait-detail__section">
                  <h2>Family Comparison</h2>
                  <family-compare individuals="${JSON.stringify(familyData)}"></family-compare>
                </section>
              `
            : html``}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} r @param {object|null} trait */
function scoredContent(r, trait) {
  const fmt =
    r.value !== null && r.value !== undefined ? formatTraitValue(r.value, trait?.unit) : null;
  const pgsEntries = r.pgsDetails ? buildPgsEntries(r) : [];
  return html`
    <section class="trait-detail__section">
      <h2>Score</h2>
      <percentile-bar value="${r.percentile || 0}"></percentile-bar>
      <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
      ${fmt ? html`<p class="trait-detail__value">Predicted: ${fmt.display}</p>` : html``}
    </section>
    ${riskBalance(r)}
    <section class="trait-detail__section">
      <h2>Best PGS</h2>
      <p>${r.bestPGS || '—'} · Quality: ${(r.bestPGSQualityScore || 0).toFixed(1)}</p>
      <p class="trait-detail__meta">${(r.totalMatches || 0).toLocaleString()} variants matched</p>
    </section>
    ${pgsEntries.length > 0
      ? html`
          <section class="trait-detail__section">
            <h2>PGS Comparison</h2>
            <pgs-table pgsData="${JSON.stringify(pgsEntries)}"></pgs-table>
          </section>
        `
      : html``}
  `;
}

/** @param {object} r */
function riskBalance(r) {
  const best = r.pgsDetails?.[r.bestPGS];
  if (!best?.positive_sum) return html``;
  const total = Math.abs(best.positive_sum) + Math.abs(best.negative_sum);
  const pct = total > 0 ? Math.round((Math.abs(best.positive_sum) / total) * 100) : 50;
  return html`
    <section class="trait-detail__section">
      <h2>Risk vs Protective</h2>
      <div class="trait-detail__balance-bar">
        <div class="trait-detail__balance-risk" style="${{ width: `${pct}%` }}"></div>
      </div>
      <p class="trait-detail__meta">${pct}% risk · ${100 - pct}% protective</p>
    </section>
  `;
}

/**
 *
 */
function noResultMsg() {
  return html`<p class="trait-detail__empty">No result for this individual yet.</p>`;
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
async function handleSwitch(host, e) {
  const id = e.detail;
  host.activeId = id;
  host.resultVersion = 0;
  await loadResults(id);
  host.resultVersion = 1;
  loadFamily(host);
}
