/**
 * Settings drawer — danger zone and footer sections.
 * @module components/organisms/settings-drawer/drawer-danger
 */

import { html } from 'hybrids';
import { doClearAll } from './drawer-handlers.js';

/**
 *
 */
export function dangerSection(host) {
  if (host.clearing) {
    return html`
      <section class="settings-drawer__section">
        <h3><app-icon name="alert"></app-icon> Danger Zone</h3>
        <div class="settings-drawer__clearing">
          <span class="spinner"></span> Clearing all data…
        </div>
      </section>
    `;
  }
  if (host.confirmClear) {
    return html`
      <section class="settings-drawer__section">
        <h3><app-icon name="alert"></app-icon> Danger Zone</h3>
        <p class="settings-drawer__meta">
          This will permanently delete all individuals, results, and settings.
        </p>
        <div class="settings-drawer__row">
          <button class="btn btn-danger" onclick="${startClear}">
            <app-icon name="trash"></app-icon> Yes, Delete Everything
          </button>
          <button
            class="btn btn-ghost"
            onclick="${(h) => {
              h.confirmClear = false;
            }}"
          >
            Cancel
          </button>
        </div>
      </section>
    `;
  }
  return html`
    <section class="settings-drawer__section">
      <h3><app-icon name="alert"></app-icon> Danger Zone</h3>
      <button
        class="btn btn-danger"
        onclick="${(h) => {
          h.confirmClear = true;
        }}"
      >
        <app-icon name="trash"></app-icon> Clear All Data
      </button>
    </section>
  `;
}

/**
 *
 */
function startClear(host) {
  host.clearing = true;
  requestAnimationFrame(() => {
    setTimeout(() => doClearAll(host), 50);
  });
}

/**
 *
 */
export function footerSection() {
  return html`
    <section class="settings-drawer__section">
      <p class="settings-drawer__meta">
        <app-icon name="shield-check" size="sm"></app-icon>
        Asili
        v${
          /** @type {HTMLMetaElement|null} */ (document.querySelector('meta[name="app-version"]'))
            ?.content || '?'
        }
        · Privacy-first · Your data never leaves this device
      </p>
      <p class="settings-drawer__meta">
        <a href="https://github.com/techninja/asili/issues" target="_blank" rel="noopener">
          🪲 Report a problem
        </a>
        ·
        <a href="https://github.com/techninja/asili" target="_blank" rel="noopener">
          Source code
        </a>
      </p>
    </section>
  `;
}
