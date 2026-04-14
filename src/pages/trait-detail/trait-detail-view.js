/** @module pages/trait-detail */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#atoms/percentile-bar/percentile-bar.js';
// @ts-ignore
import '#atoms/confidence-badge/confidence-badge.js';
// @ts-ignore
import '#atoms/chr-coverage/chr-coverage.js';
// @ts-ignore
import '#molecules/pgs-table/pgs-table.js';
// @ts-ignore
import '#molecules/family-compare/family-compare.js';
// @ts-ignore
import '#molecules/individual-switcher/individual-switcher.js';
import { results, getActiveId, loadResults } from '#pages/beta/results-store.js';
import { getTraitList, getPgsMeta } from '#utils/manifest.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import {
  buildPgsEntries,
  loadFamily,
  riskBalance,
  coverageIndicator,
  chrCoverageSection,
  insufficientContent,
} from './trait-detail-helpers.js';

const NULL_CONF = ['none', 'insufficient', ''];

export default define({
  tag: 'trait-detail-view',
  [router.connect]: { url: '/trait/:traitId' },
  traitId: '',
  activeId: { value: '', connect: () => {} },
  resultVersion: { value: 0, connect: () => {} },
  trait: {
    value: /** @type {object} */ ({}),
    connect: (host, _key, invalidate) => {
      host.activeId = getActiveId();
      getTraitList().then((list) => {
        host.trait = list.find((t) => t.trait_id === host.traitId) || null;
        invalidate();
      });
    },
  },
  pgsMeta: {
    value: /** @type {object|null} */ (null),
    connect: (host, _key, invalidate) => {
      const r = results[host.traitId];
      if (r?.bestPGS)
        getPgsMeta(r.bestPGS).then((m) => {
          host.pgsMeta = m;
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
    value: ({ traitId, trait, activeId, resultVersion, familyData, pgsMeta }) => {
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
          ${r
            ? scoredContent(r, trait, familyData, pgsMeta)
            : html`<p class="trait-detail__empty">No result for this individual yet.</p>`}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} r @param {object|null} trait */
function scoredContent(r, trait, familyData, pgsMeta) {
  if (NULL_CONF.includes(r.confidence || '')) return insufficientContent(r);
  const fmt =
    r.value !== null && r.value !== undefined ? formatTraitValue(r.value, trait?.unit) : null;
  const pgsEntries = r.pgsDetails ? buildPgsEntries(r) : [];
  const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  return html`
    <div class="trait-detail__grid">
      <section class="trait-detail__section">
        <h2>Score</h2>
        <percentile-bar value="${r.percentile || 0}"></percentile-bar>
        <confidence-badge level="${r.confidence || 'none'}"></confidence-badge>
        ${fmt ? html`<p class="trait-detail__value">Predicted: ${fmt.display}</p>` : html``}
      </section>
      <section class="trait-detail__section">
        <h2>Best PGS</h2>
        <p>${r.bestPGS || '—'}${pgsMeta?.method ? ` — ${pgsMeta.method}` : ''}</p>
        <p class="trait-detail__meta">
          Quality: ${(r.bestPGSQualityScore || 0).toFixed(1)} ·
          ${(det?.matchedVariants || 0).toLocaleString()} /
          ${(pgsMeta?.variantsNumber || 0).toLocaleString()} variants
          (${Math.round((det?.coverage || 0) * 100)}%)
        </p>
      </section>
      ${riskBalance(r)} ${coverageIndicator(r)} ${chrCoverageSection(r)}
      ${familyData?.length > 0
        ? html`<section class="trait-detail__section">
            <h2>Family Comparison</h2>
            <family-compare individuals="${JSON.stringify(familyData)}"></family-compare>
          </section>`
        : html``}
      ${pgsEntries.length > 0
        ? html`<section class="trait-detail__section trait-detail__grid--wide">
            <h2>PGS Comparison</h2>
            <pgs-table pgsData="${JSON.stringify(pgsEntries)}"></pgs-table>
          </section>`
        : html``}
    </div>
  `;
}

/** @param {object} r */
/** @param {object & HTMLElement} host @param {CustomEvent} e */
/** @param {object & HTMLElement} host @param {CustomEvent} e */
async function handleSwitch(host, e) {
  const id = e.detail;
  host.activeId = id;
  host.resultVersion = 0;
  await loadResults(id);
  host.resultVersion = 1;
  loadFamily(host);
}
