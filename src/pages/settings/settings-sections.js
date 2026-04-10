/**
 * Settings view sections — render helpers for settings page.
 * @module pages/settings/settings-sections
 */

import { html } from 'hybrids';
import { exportData, importData } from './settings-helpers.js';

/** @param {string} storageInfo */
export function storageSection(storageInfo) {
  return html`
    <section class="settings__section">
      <h2>Storage</h2>
      <p class="settings__meta">${storageInfo || 'Calculating…'}</p>
      <div class="settings__actions">
        <button class="btn btn-secondary" onclick="${exportData}">📦 Export data</button>
        <label class="btn btn-secondary">
          📥 Import data
          <input type="file" accept=".json" class="sr-only" onchange="${importData}" />
        </label>
      </div>
    </section>
  `;
}

/**
 * @param {string} memoryLimit
 * @param {number} workerCount
 * @param {boolean} autoScore
 * @param {Function} onMemory
 * @param {Function} onWorkers
 * @param {Function} onAutoScore
 */
export function scoringSection(
  memoryLimit,
  workerCount,
  autoScore,
  onMemory,
  onWorkers,
  onAutoScore,
) {
  const cores = navigator.hardwareConcurrency || 4;
  const memOpts = ['512MB', '1GB', '2GB', '4GB', '8GB'];
  const workerOpts = Array.from({ length: Math.min(cores, 8) }, (_, i) => i + 1);
  const memMB = parseInt(memoryLimit) * (memoryLimit.includes('GB') ? 1024 : 1);
  const memGB = ((memMB * workerCount) / 1024).toFixed(1);
  return html`
    <section class="settings__section">
      <h2>Scoring</h2>
      <div class="settings__field">
        <label>Memory per worker</label>
        <select class="settings__select" onchange="${onMemory}">
          ${memOpts.map(
            (v) => html`<option value="${v}" selected="${v === memoryLimit}">${v}</option>`,
          )}
        </select>
      </div>
      <div class="settings__field">
        <label>Workers</label>
        <select class="settings__select" onchange="${onWorkers}">
          ${workerOpts.map(
            (v) => html`<option value="${v}" selected="${v === workerCount}">${v}</option>`,
          )}
        </select>
        <span class="settings__hint">${cores} cores · ${memGB}GB total</span>
      </div>
      <div class="settings__field">
        <label>
          <input type="checkbox" checked="${autoScore}" onchange="${onAutoScore}" />
          Auto-score on upload
        </label>
      </div>
    </section>
  `;
}

/** @param {boolean} confirmClear @param {Function} doClear */
export function dangerSection(confirmClear, doClear) {
  return html`
    <section class="settings__section">
      <h2>Danger Zone</h2>
      ${confirmClear
        ? html`
            <p class="settings__warn">This will delete all individuals, variants, and results.</p>
            <div class="settings__actions">
              <button class="btn btn-danger" onclick="${doClear}">Yes, delete everything</button>
              <button
                class="btn btn-ghost"
                onclick="${(h) => {
                  h.confirmClear = false;
                }}"
              >
                Cancel
              </button>
            </div>
          `
        : html`<button
            class="btn btn-danger"
            onclick="${(h) => {
              h.confirmClear = true;
            }}"
          >
            🗑 Clear all data
          </button>`}
    </section>
  `;
}
