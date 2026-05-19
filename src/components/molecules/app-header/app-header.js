/**
 * App header render helper — shared across all views.
 * @module components/molecules/app-header
 */

import { html } from 'hybrids';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';

/**
 * @param {object} opts
 * @param {*} [opts.onSettings] - Settings button click handler
 * @param {*} [opts.center] - Center content (html template)
 * @param {*} [opts.badge] - Badge next to logo
 * @param {*} [opts.trailing] - Content before settings (e.g. pager)
 * @returns {*}
 */
export function appHeader({ onSettings, center, badge, trailing } = {}) {
  if (!measured) requestAnimationFrame(initHeaderObserver);
  return html`
    <header class="app-header">
      <a href="/" class="app-header__logo">
        <img src="/logo.svg" alt="" class="app-header__logo-img" />
        <span>asili</span>
      </a>
      ${badge ? html`<span class="app-header__badge">${badge}</span>` : html``}
      <div class="app-header__center">${center || html``}</div>
      <div class="app-header__actions">
        ${trailing || html``}
        ${onSettings
          ? html`<button class="app-header__link" onclick="${onSettings}" title="Settings">
              <app-icon name="settings"></app-icon>
            </button>`
          : html``}
        <theme-toggle></theme-toggle>
      </div>
    </header>
  `;
}

let measured = false;
/**
 *
 */
function initHeaderObserver() {
  if (measured) return;
  const el = document.querySelector('.app-header');
  if (!el) return;
  measured = true;
  const update = () => {
    document.documentElement.style.setProperty(
      '--header-height',
      `${Math.round(/** @type {HTMLElement} */ (el).offsetHeight)}px`,
    );
  };
  update();
  window.addEventListener('resize', update);
}
