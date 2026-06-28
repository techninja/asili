/**
 * Gene detail view — deep dive into a single gene.
 * Routable at /gene/:symbol, shareable URL.
 * @module pages/gene-detail
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
// @ts-ignore
import '#molecules/individual-switcher/individual-switcher.js';
// @ts-ignore
import '#molecules/floating-bar/floating-bar.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import { initGeneView, handleSwitch } from './gene-detail-init.js';
import { registerKeyNav } from '#utils/keyboard-nav.js';
import {
  heroSection,
  variantSection,
  statsSection,
  descriptionSection,
  linksSection,
} from './gene-detail-sections.js';
import { chrRail } from './gene-detail-rail.js';

const GeneDetail = define({
  tag: 'gene-detail-view',
  [router.connect]: { url: '/gene/:symbol' },
  symbol: {
    value: '',
    observe: (host, val, last) => {
      if (val && val !== last) initGeneView(host);
    },
  },
  gene: { value: /** @type {object|null} */ ({}), connect: () => {} },
  activeId: { value: '', connect: () => {} },
  indEmoji: '\u{1F9EC}',
  indName: '',
  isImputed: false,
  variantHits: { value: /** @type {Array<string>} */ ([]), connect: () => {} },
  variantCount: 0,
  dr2Bins: { value: /** @type {object|null} */ ({}), connect: () => {} },
  geneStats: { value: /** @type {object|null} */ ({}), connect: () => {} },
  prevGene: '',
  nextGene: '',
  _init: {
    value: false,
    connect: (host) => {
      initGeneView(host);
      const cleanup = registerKeyNav({
        getPrev: () => (host.prevGene ? '/gene/' + host.prevGene : ''),
        getNext: () => (host.nextGene ? '/gene/' + host.nextGene : ''),
      });
      return cleanup;
    },
  },
  render: {
    value: (host) => {
      const { gene, isImputed, dr2Bins } = host;
      const variantHits = Array.isArray(host.variantHits) ? host.variantHits : [];
      const variantCount = host.variantCount || 0;
      const geneStats = host.geneStats;

      return html`
        <div class="app-layout">
          <div class="app-layout__sticky-top">
            ${appHeader({
              badge: 'beta',
              onSettings: () => toggleSettings(),
              center: html`<individual-switcher
                activeId="${host.activeId}"
                onswitch-individual="${handleSwitch}"
              ></individual-switcher>`,
            })}
            <div class="app-layout__sub-header">
              <nav class="app-layout__sub-header-inner gene-detail__breadcrumb">
                <a
                  href="/beta"
                  class="gene-detail__breadcrumb-back"
                  onclick="${() => sessionStorage.setItem('asili-source-tab', 'explore')}"
                >
                  <app-icon name="arrow-left"></app-icon>
                  Genes
                </a>
                <span class="gene-detail__breadcrumb-sep">
                  <app-icon name="chevron-right" size="sm"></app-icon>
                </span>
                <span class="gene-detail__breadcrumb-current"
                  >${gene?.emoji || '\u{1F9EC}'} ${host.symbol}</span
                >
              </nav>
            </div>
          </div>
          <main class="app-layout__content">
            ${gene?.symbol
              ? geneContent(
                  gene,
                  variantHits,
                  variantCount,
                  isImputed,
                  dr2Bins,
                  geneStats,
                  host.indEmoji,
                  host.indName,
                )
              : html`<div class="gene-detail__loading">Loading gene data…</div>`}
          </main>
          ${appFooter()}
          <floating-bar
            prevHref="${host.prevGene ? '/gene/' + host.prevGene : ''}"
            nextHref="${host.nextGene ? '/gene/' + host.nextGene : ''}"
          ></floating-bar>
        </div>
      `;
    },
    shadow: false,
  },
});

function geneContent(
  gene,
  variantHits,
  variantCount,
  isImputed,
  dr2Bins,
  geneStats,
  indEmoji,
  indName,
) {
  return html`
    <div class="gene-detail gene-detail--with-rail">
      <div class="gene-detail__main">
        ${heroSection(gene)}
        ${variantSection(gene, variantHits, variantCount, isImputed, geneStats, indEmoji, indName)}
        ${statsSection(gene)} ${descriptionSection(gene)} ${linksSection(gene)}
      </div>
      ${chrRail(gene, dr2Bins)}
    </div>
  `;
}

export default GeneDetail;
