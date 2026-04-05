/**
 * Coming Soon page — placeholder for app.asili.dev while the app is built.
 * @module pages/home
 */

import { html, define } from 'hybrids';
import '../../components/atoms/theme-toggle/theme-toggle.js';

export default define({
  tag: 'home-view',
  render: {
    value: () => html`
      <div class="coming-soon">
        <header class="coming-soon__header">
          <a href="/" class="coming-soon__logo">
            <img src="/logo.svg" alt="" class="coming-soon__logo-img" />
            <span>asili</span>
          </a>
          <div class="coming-soon__header-actions">
            <a href="https://asili.dev" class="btn btn-ghost">← Back to asili.dev</a>
            <theme-toggle></theme-toggle>
          </div>
        </header>

        <main class="coming-soon__hero">
          <div class="coming-soon__emoji">🧬</div>
          <h1 class="coming-soon__title">App Coming Soon</h1>
          <p class="coming-soon__sub">
            Privacy-first polygenic risk score analysis. Upload your DNA file and explore dozens of
            traits — everything runs in your browser. We never see your data.
          </p>
          <div class="coming-soon__badges">
            <span class="coming-soon__badge">🔒 Zero Data Collection</span>
            <span class="coming-soon__badge">🧪 44 Traits at Launch</span>
            <span class="coming-soon__badge">📖 Open Source</span>
          </div>
          <div class="coming-soon__cta">
            <a
              href="https://github.com/techninja/asili"
              class="btn btn-primary"
              target="_blank"
              rel="noopener"
              >View on GitHub</a
            >
            <a href="https://asili.dev/blog" class="btn btn-secondary">Read the Blog</a>
          </div>
        </main>

        <section class="coming-soon__features">
          <div class="coming-soon__features-inner">
            <h2 class="coming-soon__features-title">What's coming</h2>
            <div class="coming-soon__grid">
              ${card('📁', 'Upload your DNA', 'Drop in your raw file from 23andMe, AncestryDNA, MyHeritage, or others.')}
              ${card('⚡', 'Browser-only scoring', 'DuckDB WASM scores your variants against published GWAS data — no server.')}
              ${card('📊', 'Explore 44 traits', 'BMI, height, chronotype, caffeine metabolism, and more with clear explanations.')}
              ${card('👨‍👩‍👧‍👦', 'Family comparison', 'Upload multiple family members and compare scores side by side.')}
              ${card('🔬', 'Variant deep-dives', 'See which specific variants contribute most to each trait score.')}
              ${card('📄', 'Printable reports', 'Category radar charts and full reports you can take to a consultation.')}
            </div>
          </div>
        </section>

        <footer class="coming-soon__footer">
          <p>
            © ${new Date().getFullYear()} Asili · AGPLv3 ·
            <a href="https://asili.dev">asili.dev</a> ·
            <a href="https://asili.dev/privacy">Privacy</a>
          </p>
        </footer>
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
