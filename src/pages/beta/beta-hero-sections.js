/**
 * Hero static content sections — trait showcase, how it works, privacy.
 * @module pages/beta/beta-hero-sections
 */

import { html } from 'hybrids';

/**
 *
 */
export function traitShowcase() {
  return html`
    <section class="beta-hero__showcase">
      <h2 class="beta-hero__section-title">What you'll discover</h2>
      <div class="beta-hero__trait-grid">
        ${tp('📊', 'Body Mass Index', '80M+ variants analyzed')}
        ${tp('📏', 'Height', 'Predicted vs actual comparison')}
        ${tp('☕', 'Coffee Consumption', 'How much is in your genes?')}
        ${tp('🌅', 'Chronotype', 'Morning lark or night owl')}
        ${tp('🔥', 'Basal Metabolic Rate', 'Your genetic metabolism baseline')}
        ${tp('🩸', 'Cholesterol & Lipids', 'HDL, triglycerides, and more')}
        ${tp('👨\u200d🦲', 'Male Pattern Baldness', 'What does your DNA predict?')}
        ${tp('☀️', 'Vitamin D Level', 'Genetic absorption tendency')}
      </div>
      <p class="beta-hero__trait-count">
        44 traits in the public version ·
        <a href="https://asili.dev/diy" target="_blank" rel="noopener">Self-host for 648+</a>
      </p>
    </section>
  `;
}

/**
 *
 */
function tp(emoji, name, detail) {
  return html`
    <div class="beta-hero__trait-preview">
      <span class="beta-hero__trait-emoji">${emoji}</span>
      <div>
        <strong>${name}</strong>
        <span class="beta-hero__trait-detail">${detail}</span>
      </div>
    </div>
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
        ${step('1', '📁', 'Upload', 'Drop your DNA file from 23andMe, AncestryDNA, or others')}
        ${step('2', '⚡', 'Score', 'DuckDB WASM scores variants against published research')}
        ${step('3', '📊', 'Explore', 'Browse results, compare family members, print reports')}
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
