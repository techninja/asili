/**
 * App footer render helper — shared across all views.
 * @module components/molecules/app-footer
 */

import { html } from 'hybrids';

/** @returns {*} Hybrids html template */
export function appFooter() {
  return html`
    <footer class="app-footer">
      <p>
        © ${new Date().getFullYear()} Asili · AGPLv3 ·
        <a href="https://asili.dev">asili.dev</a> ·
        <a href="https://asili.dev/privacy">Privacy</a> ·
        <a href="https://github.com/techninja/asili" target="_blank" rel="noopener">GitHub</a>
      </p>
    </footer>
  `;
}
