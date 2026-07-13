/**
 * App landing hero — shown when no individuals are loaded.
 * Sells the discovery experience, links to DNA sources, upload CTA.
 * @module pages/app/beta-hero
 */

import { html } from 'hybrids';
import { handleFile } from './sections.js';
import { loadDemoData } from './init.js';
import { traitShowcase, howItWorks, privacySection } from './hero-sections.js';
import '#atoms/hero-canvas/hero-canvas.js';

/** @param {object} host @param {Function} cancelFn */
export function heroContent(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  const isError = host.parseStatus === 'error';
  const showUpload = !isParsing && !isSetup && !isError;

  return html`
    <div class="beta-hero">
      <hero-canvas></hero-canvas>
      <section class="beta-hero__intro">
        <img src="/logo.svg" alt="Asili" class="beta-hero__logo" />
        <h1 class="beta-hero__title">Discover what your DNA says about you</h1>
        <p class="beta-hero__sub">
          Explore polygenic scores and common genes for 64 traits — BMI, height, cholesterol,
          caffeine metabolism, and chronotype. All processing happens on your device. We never see
          your data.
        </p>
      </section>

      <section class="beta-hero__upload">
        ${showUpload ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>` : html``}
        ${isParsing ? parsingState(host) : html``} ${isSetup ? setupState(host, cancelFn) : html``}
        ${isError ? errorState(host, cancelFn) : html``} ${showUpload ? demoOption(host) : html``}
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
        import('./sections.js').then((m) => m.handleSetup(h, e));
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

/** Below-upload divider with demo opt-in and DNA source link. */
function demoOption(host) {
  return html`
    <div class="beta-hero__below-upload">
      <p class="beta-hero__source-link">
        Don't have your file yet?
        <a href="https://asili.dev/dna-sources" target="_blank" rel="noopener"
          >See where to get it →</a
        >
      </p>
      <div class="beta-hero__divider"><span>or</span></div>
      <button
        class="btn btn-primary beta-hero__demo-btn"
        onclick="${async (h) => {
          h._demoLoading = true;
          await loadDemoData();
          const idb = await import('/packages/core/src/data-layer/idb.js');
          await idb.openDB();
          h.individuals = await idb.getAll('individuals');
          h.isDemo = true;
          const { loadResults } = await import('./results-store.js');
          if (h.individuals.length) {
            h.activeId = h.individuals[0].id;
            h.resultCount = await loadResults(h.activeId);
          }
          const { initQueue, switchIndividual } = await import('./scoring-controller.js');
          await initQueue(h);
          if (h.activeId) switchIndividual(h, h.activeId);
          h._demoLoading = false;
        }}"
      >
        ${host._demoLoading
          ? html`<app-icon name="loader"></app-icon> Loading…`
          : html`<app-icon name="sparkles"></app-icon> Explore with sample data`}
      </button>
    </div>
  `;
}
