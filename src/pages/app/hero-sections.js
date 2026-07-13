/**
 * Hero static content sections — trait showcase, how it works, privacy.
 * @module pages/app/beta-hero-sections
 */

import { html, msg } from 'hybrids';
/**
 *
 */
export function traitShowcase() {
  return html`
    <section class="beta-hero__showcase">
      <h2 class="beta-hero__section-title">What you'll discover</h2>
      <div class="beta-hero__trait-grid">
        ${tp('📊', msg`Body Mass Index`, msg`Genetic weight tendency`, 'EFO_0004340')}
        ${tp('📏', msg`Height`, msg`Predicted vs actual comparison`, 'OBA_VT0001253')}
        ${tp('☕', msg`Coffee Consumption`, msg`How much is in your genes?`, 'EFO_0006781')}
        ${tp('🌅', msg`Chronotype`, msg`Morning lark or night owl`, 'EFO_0008328')}
        ${tp('👨\u200d🦲', msg`Male Pattern Baldness`, msg`What does your DNA predict?`, 'EFO_0007825')}
        ${tp('☀️', msg`Vitamin D`, msg`Genetic absorption tendency`, 'OBA_1000968')}
        ${tp('🧠', msg`Cognitive Ability`, msg`Genetic cognitive baseline`, 'EFO_0004337')}
        ${tp('💓', msg`Resting Heart Rate`, msg`Your cardiovascular genetics`, 'OBA_1001087')}
      </div>
      <p class="beta-hero__trait-count">
        64 traits ·
        <a href="https://asili.dev/diy" target="_blank" rel="noopener">Self-host for 648+</a>
      </p>
    </section>
  `;
}

/**
 *
 */
function tp(emoji, name, detail, traitId) {
  return html`
    <a href="/trait/${traitId}" class="beta-hero__trait-preview">
      <span class="beta-hero__trait-emoji">${emoji}</span>
      <div>
        <strong>${name}</strong>
        <span class="beta-hero__trait-detail">${detail}</span>
      </div>
    </a>
  `;
}

/**
 *
 */
export function howItWorks() {
  return html`
    <section class="beta-hero__steps">
      <h2 class="beta-hero__section-title">How it works</h2>
      <div class="beta-hero__step-grid">
        ${step('1', '📁', msg`Upload`, msg`Drop your DNA file from 23andMe, AncestryDNA, or others`)}
        ${step('2', '⚡', msg`Score`, msg`DuckDB WASM scores variants against published research`)}
        ${step('3', '📊', msg`Explore`, msg`Browse results, compare family members, print reports`)}
      </div>
    </section>
  `;
}

/**
 *
 */
function step(num, emoji, title, desc) {
  return html`
    <div class="beta-hero__step">
      <div class="beta-hero__step-num">${num}</div>
      <div class="beta-hero__step-emoji">${emoji}</div>
      <strong>${title}</strong>
      <p>${desc}</p>
    </div>
  `;
}

/**
 *
 */
export function privacySection() {
  return html`
    <section class="beta-hero__privacy">
      <h2 class="beta-hero__section-title">🔒 Your data never leaves your device</h2>
      <p class="beta-hero__privacy-text">
        No accounts. No servers. No analytics. No cookies. Your genomic data is processed entirely
        in your browser using WebAssembly. The source code is
        <a href="https://github.com/techninja/asili" target="_blank" rel="noopener">open source</a>
        so you can verify every line.
      </p>
    </section>
  `;
}
