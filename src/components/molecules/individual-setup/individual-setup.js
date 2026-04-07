/**
 * Individual setup — name + emoji builder after DNA parse.
 * Shows rich metadata for .asili imputed files.
 * @module components/molecules/individual-setup
 */

import { html, define, dispatch } from 'hybrids';
// @ts-ignore
import '#molecules/emoji-builder/emoji-builder.js';

/** @param {object & HTMLElement} host */
function handleSubmit(host, e) {
  e.preventDefault();
  if (!host.name.trim()) return;
  dispatch(host, 'setup-complete', {
    detail: { name: host.name.trim(), emoji: host.emoji },
    bubbles: true,
  });
}

export default define({
  tag: 'individual-setup',
  name: '',
  emoji: '👤',
  variantCount: 0,
  format: '',
  filename: '',
  manifest: '',
  render: {
    value: ({ name, emoji, variantCount, format, filename, manifest }) => {
      const m = manifest ? JSON.parse(manifest) : null;
      return html`
        <div class="individual-setup">
          <div class="individual-setup__status">
            ${m ? imputedStatus(m, filename) : textStatus(variantCount, format, filename)}
          </div>
          <form class="individual-setup__form" onsubmit="${handleSubmit}">
            <label class="individual-setup__label">
              Name
              <input
                type="text"
                class="individual-setup__input"
                placeholder="e.g. Sarah"
                value="${name}"
                oninput="${(h, e) => {
                  h.name = e.target.value;
                }}"
                autofocus
              />
            </label>
            <div class="individual-setup__emoji-section">
              <span class="individual-setup__label">Avatar</span>
              <emoji-builder
                onemoji-change="${(host, e) => {
                  host.emoji = e.detail;
                }}"
              ></emoji-builder>
            </div>
            <div class="individual-setup__actions">
              <button type="submit" class="btn btn-primary" disabled="${!name.trim()}">
                Continue & Score
              </button>
              <button
                type="button"
                class="btn btn-ghost"
                onclick="${(host) => dispatch(host, 'setup-cancel', { bubbles: true })}"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} m @param {string} filename */
function imputedStatus(m, filename) {
  const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'Unknown';
  const total = (m.totalVariants || 0).toLocaleString();
  const geno = (m.genotypedVariants || 0).toLocaleString();
  const imp = (m.imputedVariants || 0).toLocaleString();
  const chrCount = m.chromosomes ? Object.keys(m.chromosomes).length : 0;
  return html`
    <div class="individual-setup__imputed-card">
      <p class="individual-setup__verified">✅ Verified .asili archive</p>
      <p class="individual-setup__imputed-name">⭐ ${m.individual || 'Unknown'}</p>
      <div class="individual-setup__imputed-stats">
        <span>${total} total variants</span>
        <span>${geno} genotyped · ${imp} imputed</span>
        <span>${chrCount} chromosomes · ${m.source || ''}</span>
      </div>
      <p class="individual-setup__imputed-date">Created ${date}</p>
      ${filename ? html`<p class="individual-setup__file">📄 ${filename}</p>` : html``}
    </div>
  `;
}

/** @param {number} count @param {string} format @param {string} filename */
function textStatus(count, format, filename) {
  return html`
    <p class="individual-setup__parsed">
      ✓ ${count.toLocaleString()} variants parsed from ${format}
    </p>
    ${filename ? html`<p class="individual-setup__file">📄 ${filename}</p>` : html``}
  `;
}
