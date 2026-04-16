/** @module pages/trait-detail */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
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
import * as idb from '/packages/core/src/data-layer/idb.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import { loadFamily } from './trait-detail-helpers.js';
import { scoredContent } from './trait-detail-sections.js';
import { scoreHero } from './trait-detail-hero.js';

const TraitDetail = define({
  tag: 'trait-detail-view',
  [router.connect]: { url: '/trait/:traitId' },
  traitId: {
    value: '',
    observe: (host, val, last) => {
      if (val && val !== last) initView(host);
    },
  },
  activeId: { value: '', connect: () => {} },
  trait: { value: /** @type {object} */ ({}) },
  pgsMeta: { value: /** @type {object} */ ({}) },
  familyData: { value: /** @type {Array<object>} */ ([]) },
  indEmoji: '🧬',
  _init: {
    value: false,
    connect: (host) => {
      initView(host);
    },
  },
  render: {
    value: (host) => {
      const { traitId, trait, familyData, pgsMeta } = host;
      const r = results[traitId];
      const name = trait?.name || traitId;
      const emoji = trait?.emoji || '🧬';

      return html`
        <div class="trait-detail">
          ${appHeader({
            badge: 'beta',
            onSettings: () => toggleSettings(),
            center: html`<individual-switcher
              activeId="${host.activeId}"
              onswitch-individual="${handleSwitch}"
            ></individual-switcher>`,
            trailing:
              trait?._prev || trait?._next
                ? html`<div class="trait-detail__pager">
                    ${trait._prev
                      ? html`<a
                          href="${router.url(TraitDetail, { traitId: trait._prev })}"
                          class="trait-detail__pager-btn"
                          title="Previous trait"
                          ><app-icon name="step-back"></app-icon
                        ></a>`
                      : html``}
                    ${trait._next
                      ? html`<a
                          href="${router.url(TraitDetail, { traitId: trait._next })}"
                          class="trait-detail__pager-btn"
                          title="Next trait"
                          ><app-icon name="step-forward"></app-icon
                        ></a>`
                      : html``}
                  </div>`
                : html``,
          })}
          <div class="beta-view__tabs">
            <a href="/beta" class="beta-view__tab beta-view__tab--active">
              <app-icon name="arrow-left"></app-icon> Traits
            </a>
          </div>
          <main class="trait-detail__main">
            <div class="trait-detail__hero">
              <div class="trait-detail__identity">
                <h1 class="trait-detail__title">${emoji} ${name}</h1>
                ${trait?.description
                  ? html`<p class="trait-detail__desc">${trait.description}</p>`
                  : html``}
              </div>
              ${r
                ? scoreHero(r, trait, familyData, host.indEmoji)
                : html`<p class="trait-detail__empty">No result yet.</p>`}
            </div>
            ${r ? scoredContent(r, trait, familyData, pgsMeta) : html``}
          </main>
          ${appFooter()}
        </div>
      `;
    },
    shadow: false,
  },
});

/** Load all data for the current traitId. */
async function initView(host) {
  const id = getActiveId();
  host.activeId = id;
  if (id && !Object.keys(results).length) await loadResults(id);

  // Load individual emoji
  try {
    await idb.openDB();
    const ind = await idb.get('individuals', id);
    host.indEmoji = ind?.emoji || '🧬';
  } catch {
    host.indEmoji = '🧬';
  }

  const list = await getTraitList();
  const idx = list.findIndex((t) => t.trait_id === host.traitId);
  const t = idx >= 0 ? { ...list[idx] } : {};
  t._prev = idx > 0 ? list[idx - 1].trait_id : '';
  t._next = idx < list.length - 1 ? list[idx + 1].trait_id : '';
  host.trait = t;

  const r = results[host.traitId];
  host.pgsMeta = r?.bestPGS ? (await getPgsMeta(r.bestPGS)) || {} : {};

  await loadFamily(host);
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
async function handleSwitch(host, e) {
  const id = e.detail;
  host.activeId = id;
  await loadResults(id);
  await initView(host);
}

export default TraitDetail;
