/**
 * Settings drawer — slides in from right as an overlay.
 * @module components/organisms/settings-drawer
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#molecules/individual-list/individual-list.js';
import { close, loadData } from './drawer-handlers.js';
import {
  individualsSection,
  storageSection,
  scoringSection,
  developerSection,
  dangerSection,
  footerSection,
} from './drawer-sections.js';

export default define({
  tag: 'settings-drawer',
  open: false,
  individuals: { value: /** @type {Array} */ ([]), connect: () => {} },
  storageInfo: '',
  autoScore: true,
  memoryLimit: '2GB',
  bandwidthLimit: 0,
  ancestry: '',
  units: {
    value: 'metric',
    connect(host) {
      host.units = localStorage.getItem('asili-units') || 'metric';
    },
  },
  confirmClear: false,
  clearing: false,
  closing: false,
  diagnosticOutput: '',
  systemDiagnosticOutput: '',
  _loaded: {
    value: false,
    observe(host, _, last) {
      if (host.open && !last) loadData(host);
    },
  },
  render: {
    value: (host) => {
      if (!host.open) return html``;
      const cls = host.closing ? 'settings-drawer--closing' : '';
      return html`
        <div class="${cls}">
          <div class="settings-drawer__backdrop" onclick="${close}"></div>
          <div class="settings-drawer">
            <div class="settings-drawer__header">
              <h2>Settings</h2>
              <button class="settings-drawer__close" onclick="${close}">
                <app-icon name="x"></app-icon>
              </button>
            </div>
            <div class="settings-drawer__body">
              ${individualsSection(host)} ${storageSection(host)} ${scoringSection(host)}
              ${developerSection(host)} ${dangerSection(host)} ${footerSection()}
            </div>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});
