/**
 * App landing hero — shown when no individuals are loaded.
 * Sells the discovery experience, links to DNA sources, upload CTA.
 * @module pages/beta/beta-hero
 */

import { html } from 'hybrids';
import { handleFile } from './beta-sections.js';
import { traitShowcase, howItWorks, privacySection } from './beta-hero-sections.js';

/** @param {object} host @param {Function} cancelFn */
export function heroContent(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  const isError = host.parseStatus === 'error';
  const showUpload = !isParsing && !isSetup && !isError;

  return html`
    <div class="beta-hero">
      <section class="beta-hero__intro">
        <h1 class="beta-hero__title">Discover what your DNA says about you</h1>
        <p class="beta-hero__sub">
          Explore polygenic scores for 64 traits like BMI, height, cholesterol, caffeine metabolism,
          and chronotype. All processing happens on your device. We never see your data.
        </p>
      </section>

      <section class="beta-hero__upload">
        ${showUpload ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>` : html``}
        ${isParsing ? parsingState(host) : html``} ${isSetup ? setupState(host, cancelFn) : html``}
        ${isError ? errorState(host, cancelFn) : html``}
        ${showUpload
          ? html`<p class="beta-hero__source-link">
              Don't have your DNA file yet?
              <a href="https://asili.dev/dna-sources" target="_blank" rel="noopener"
                >See where to get it →</a
              >
            </p>`
          : html``}
      </section>

      ${showUpload ? traitShowcase() : html``} ${showUpload ? howItWorks() : html``}
      ${showUpload ? privacySection() : html``}
    </div>
  `;
}

/**
 *
 */
function parsingState(host) {
  return html`
    <div class="beta-hero__status">
      <span class="beta-hero__spinner">🧬</span>
      <p>${host.parsedCount > 0 ? `${host.parsedCount.toLocaleString()} variants` : 'Reading…'}</p>
    </div>
  `;
}

/** @param {object} host @param {Function} cancelFn */
function setupState(host, cancelFn) {
  return html`
    <individual-setup
      variantCount="${host.parsedCount}"
      format="${host.parsedFormat}"
      filename="${host.parsedFilename}"
      manifest="${host._manifest || ''}"
      onsetup-complete="${(h, e) => {
        import('./beta-sections.js').then((m) => m.handleSetup(h, e));
      }}"
      onsetup-cancel="${cancelFn}"
    ></individual-setup>
  `;
}

/** @param {object} host @param {Function} cancelFn */
function errorState(host, cancelFn) {
  return html`
    <div class="beta-hero__error">
      <p>❌ ${host.parseError}</p>
      <button class="btn btn-ghost" onclick="${cancelFn}">Try again</button>
    </div>
  `;
}
