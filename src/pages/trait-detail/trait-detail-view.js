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
import { results } from '#pages/beta/results-store.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import { scoredContent } from './trait-detail-sections.js';
import { unscoredContent } from './trait-detail-unscored.js';
import { scoreHero } from './trait-detail-hero.js';
import { initView, handleSwitch } from './trait-detail-init.js';

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
  familyData: { value: /** @type {Array<object>} */ ([]), connect: () => {} },
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
            trailing: pagerButtons(trait),
          })}
          <div class="beta-view__tabs">
            <a href="/beta" class="beta-view__tab beta-view__tab--active">
              <app-icon name="arrow-left"></app-icon> Traits
            </a>
          </div>
          <main class="trait-detail__main">
            <div class="trait-detail__hero">
              <div
                class="trait-detail__identity ${trait?.cover_image ? 'trait-detail__identity--cover' : ''}"
                style="${coverStyle(trait)}"
              >
                <span class="trait-detail__hero-emoji">${emoji}</span>
                <div class="trait-detail__identity-text">
                  <h1 class="trait-detail__title">${name}</h1>
                  ${trait?.description
                    ? html`<p class="trait-detail__desc">${trait.description}</p>`
                    : html``}
                </div>
                ${coverAttribution(trait)}
              </div>
              ${r
                ? scoreHero(r, trait, familyData, host.indEmoji)
                : html`<div class="trait-detail__empty-hero">
                    <mini-curve value="50" indEmoji="" markers=""></mini-curve>
                    <p class="trait-detail__empty">Score this trait to see your results</p>
                  </div>`}
            </div>
            ${r
              ? scoredContent(r, trait, familyData, pgsMeta, host.indEmoji)
              : unscoredContent(trait)}
          </main>
          ${appFooter()}
        </div>
      `;
    },
    shadow: false,
  },
});

/**
 *
 */
function pagerButtons(trait) {
  if (!trait?._prev && !trait?._next) return html``;
  return html`<div class="trait-detail__pager">
    ${trait._prev
      ? html`<a
          href="${router.url(TraitDetail, { traitId: trait._prev })}"
          class="trait-detail__pager-btn"
          title="Previous trait"
        >
          <app-icon name="step-back"></app-icon
        ></a>`
      : html``}
    ${trait._next
      ? html`<a
          href="${router.url(TraitDetail, { traitId: trait._next })}"
          class="trait-detail__pager-btn"
          title="Next trait"
        >
          <app-icon name="step-forward"></app-icon
        ></a>`
      : html``}
  </div>`;
}

export default TraitDetail;

/** @param {object} t */
function coverStyle(t) {
  if (!t?.cover_image?.thumb) return {};
  return {
    'background-image': `linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 100%), url(${t.cover_image.thumb})`,
    'background-size': 'cover',
    'background-position': 'center',
  };
}

/** @param {object} t */
function coverAttribution(t) {
  if (!t?.cover_image?.photographer) return html``;
  const url = `https://unsplash.com/@${t.cover_image.photographer_username}?utm_source=asili&utm_medium=referral`;
  return html`<a
    href="${url}"
    target="_blank"
    rel="noopener"
    class="trait-detail__attribution"
    >📷 ${t.cover_image.photographer}</a
  >`;
}
