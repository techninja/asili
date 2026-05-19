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
// @ts-ignore
import '#molecules/floating-bar/floating-bar.js';
import { results } from '#pages/beta/results-store.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import { scoredContent } from './trait-detail-sections.js';
import { unscoredContent } from './trait-detail-unscored.js';
import { scoreHero } from './trait-detail-hero.js';
import { initView, handleSwitch } from './trait-detail-init.js';
import { sourceLabel, coverStyle, coverAttribution } from './trait-detail-helpers.js';

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
        <div class="app-layout">
          ${appHeader({
            badge: 'beta',
            onSettings: () => toggleSettings(),
            center: html`<individual-switcher
              activeId="${host.activeId}"
              onswitch-individual="${handleSwitch}"
            ></individual-switcher>`,
            trailing: html`<a
              href="/beta"
              class="app-header__link"
              title="Add individual"
              onclick="${() => sessionStorage.setItem('asili-open-upload', '1')}"
            >
              <app-icon name="user-plus"></app-icon>
            </a>`,
          })}
          <div class="app-layout__sub-header">
            <nav class="app-layout__sub-header-inner trait-detail__breadcrumb">
              <a href="/beta" class="trait-detail__breadcrumb-back">
                <app-icon name="arrow-left"></app-icon>
                ${sourceLabel()}
              </a>
              <span class="trait-detail__breadcrumb-sep"
                ><app-icon name="chevron-right" size="sm"></app-icon
              ></span>
              <span class="trait-detail__breadcrumb-current">${emoji} ${name}</span>
            </nav>
          </div>
          <main class="app-layout__content">
            <div class="trait-detail__hero">
              <div
                class="trait-detail__identity ${trait?.cover_image
                  ? 'trait-detail__identity--cover'
                  : ''}"
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
          <floating-bar
            prevHref="${trait?._prev ? router.url(TraitDetail, { traitId: trait._prev }) : ''}"
            nextHref="${trait?._next ? router.url(TraitDetail, { traitId: trait._next }) : ''}"
          ></floating-bar>
        </div>
      `;
    },
    shadow: false,
  },
});

export default TraitDetail;
