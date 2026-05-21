/**
 * Settings drawer section renderers.
 * @module components/organisms/settings-drawer/drawer-sections
 */

import { html } from 'hybrids';
import {
  handleDelete,
  handleRescore,
  rescoreAll,
  handleAutoScore,
  handleMemory,
  handleBandwidth,
  handleAncestry,
  handleUnits,
} from './drawer-handlers.js';

export { dangerSection, footerSection } from './drawer-danger.js';

/**
 *
 */
export function individualsSection(host) {
  return html`
    <section class="settings-drawer__section">
      <div class="settings-drawer__section-header">
        <h3><app-icon name="users"></app-icon> Individuals</h3>
        <button
          class="btn btn-ghost btn-sm"
          title="Rescore all individuals"
          onclick="${() => rescoreAll(host)}"
        >
          <app-icon name="refresh" size="sm"></app-icon>
        </button>
      </div>
      <individual-list
        individuals="${JSON.stringify(host.individuals)}"
        ondelete-individual="${handleDelete}"
        onedit-individual="${handleDelete}"
        onrescore-individual="${handleRescore}"
      ></individual-list>
    </section>
  `;
}

/**
 *
 */
export function storageSection(host) {
  return html`
    <section class="settings-drawer__section">
      <h3><app-icon name="database"></app-icon> Storage</h3>
      <p class="settings-drawer__meta">${host.storageInfo || 'Calculating…'}</p>
      <p class="settings-drawer__note">
        <app-icon name="info" size="sm"></app-icon>
        Imputed .asili packs are stored on your device's disk via file handles, not in browser
        storage. Their size depends on your files.
      </p>
    </section>
  `;
}

/**
 *
 */
export function scoringSection(host) {
  return html`
    <section class="settings-drawer__section">
      <h3><app-icon name="flask-conical"></app-icon> Scoring</h3>
      <label class="settings-drawer__row">
        <span>Auto-score on upload</span>
        <input type="checkbox" checked="${host.autoScore}" onchange="${handleAutoScore}" />
      </label>
      <label class="settings-drawer__row">
        <span>Memory limit</span>
        <select onchange="${handleMemory}">
          <option value="1GB" selected="${host.memoryLimit === '1GB'}">1 GB</option>
          <option value="2GB" selected="${host.memoryLimit === '2GB'}">2 GB</option>
          <option value="4GB" selected="${host.memoryLimit === '4GB'}">4 GB</option>
        </select>
      </label>
      <label class="settings-drawer__row">
        <span>Bandwidth limit</span>
        <select onchange="${handleBandwidth}">
          <option value="0" selected="${!host.bandwidthLimit}">Unlimited</option>
          <option value="500" selected="${host.bandwidthLimit === 500}">500 Mbps</option>
          <option value="100" selected="${host.bandwidthLimit === 100}">100 Mbps</option>
          <option value="50" selected="${host.bandwidthLimit === 50}">50 Mbps</option>
          <option value="25" selected="${host.bandwidthLimit === 25}">25 Mbps</option>
          <option value="10" selected="${host.bandwidthLimit === 10}">10 Mbps</option>
          <option value="5" selected="${host.bandwidthLimit === 5}">5 Mbps</option>
        </select>
      </label>
      <label class="settings-drawer__row">
        <span>Units</span>
        <select onchange="${handleUnits}">
          <option value="metric" selected="${host.units === 'metric'}">Metric</option>
          <option value="imperial" selected="${host.units === 'imperial'}">Imperial</option>
        </select>
      </label>
      <label class="settings-drawer__row">
        <span>Ancestry normalization</span>
        <select onchange="${handleAncestry}">
          <option value="" selected="${!host.ancestry}">Global (default)</option>
          <option value="NFE" selected="${host.ancestry === 'NFE'}">European</option>
          <option value="FIN" selected="${host.ancestry === 'FIN'}">Finnish</option>
          <option value="AFR" selected="${host.ancestry === 'AFR'}">African</option>
          <option value="EAS" selected="${host.ancestry === 'EAS'}">East Asian</option>
          <option value="SAS" selected="${host.ancestry === 'SAS'}">South Asian</option>
          <option value="AMR" selected="${host.ancestry === 'AMR'}">American</option>
          <option value="ASJ" selected="${host.ancestry === 'ASJ'}">Ashkenazi</option>
          <option value="MID" selected="${host.ancestry === 'MID'}">Middle Eastern</option>
        </select>
      </label>
      <p class="settings-drawer__note">
        <app-icon name="earth" size="sm"></app-icon>
        Adjusts PGS normalization to compare against a specific ancestry group. Scores must be
        recalculated after changing. Applies to all individuals.
      </p>
    </section>
  `;
}
