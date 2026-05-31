/**
 * Home page — public beta landing for app.asili.dev.
 * @module pages/home
 */

import { html, define, router } from 'hybrids';
import '#atoms/theme-toggle/theme-toggle.js';
import '#atoms/hero-canvas/hero-canvas.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import BetaView from '#pages/beta/beta-view.js';

export default define({
  tag: 'home-view',
  [router.connect]: { url: '/', stack: [BetaView] },
  render: {
    value: () => html`
      <div class="coming-soon">
        ${appHeader({
          badge: 'beta',
          trailing: html`<a href="https://asili.dev" class="btn btn-ghost"
            ><span class="coming-soon__back-text">← Back to </span>asili.dev</a
          >`,
        })}

        <main class="coming-soon__hero">
          <hero-canvas></hero-canvas>
          <img src="/logo.svg" alt="Asili" class="coming-soon__logo-hero" />
          <h1 class="coming-soon__title">Asili Public Beta</h1>
          <p class="coming-soon__sub">
            Privacy-first polygenic risk score analysis. Upload your DNA file and explore 64
            traits — everything runs in your browser. We never see your data.
          </p>
          <div class="coming-soon__badges">
            <span class="coming-soon__badge">🔒 Zero Data Collection</span>
            <span class="coming-soon__badge">🧬 64 Traits</span>
            <span class="coming-soon__badge">📖 Open Source</span>
          </div>
          <div class="coming-soon__cta">
            <a href="/beta" class="btn btn-primary">Launch App →</a>
            <a
              href="https://github.com/techninja/asili"
              class="btn btn-secondary"
              target="_blank"
              rel="noopener"
              >View on GitHub</a
            >
            <a
              href="https://github.com/techninja/asili/issues"
              class="btn btn-secondary"
              target="_blank"
              rel="noopener"
              >🪲 Report a Bug</a
            >
          </div>
        </main>

        <div class="coming-soon__hero-fade"></div>

        <section class="coming-soon__features">
          <div class="coming-soon__features-inner">
            <h2 class="coming-soon__features-title">How it works</h2>
            <div class="coming-soon__grid">
              ${card('📁', 'Upload your DNA', 'Drop your raw file from 23andMe, AncestryDNA, MyHeritage, or others.')}
              ${card('⚡', 'Browser-only scoring', 'DuckDB WASM scores variants against published PGS Catalog data — no server.')}
              ${card('📊', 'Explore 64 traits', 'BMI, height, cholesterol, chronotype, and more with predicted values.')}
              ${card('👨‍👩‍👧‍👦', 'Family comparison', 'Upload multiple family members and compare scores side by side.')}
              ${card('🔬', 'Variant deep-dives', 'See which specific variants contribute most to each trait score.')}
              ${card('📄', 'Printable reports', 'Category radar charts and reports you can take to a consultation.')}
            </div>
          </div>
        </section>

        ${appFooter()}
      </div>
    `,
    shadow: false,
  },
});

/** Feature card helper. */
function card(emoji, heading, desc) {
  return html`
    <div class="coming-soon__card">
      <div class="coming-soon__card-emoji">${emoji}</div>
      <h3>${heading}</h3>
      <p>${desc}</p>
    </div>
  `;
}
