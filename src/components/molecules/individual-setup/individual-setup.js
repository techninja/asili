/**
 * Individual setup — name + emoji builder after DNA parse.
 * Shows rich metadata for .asili imputed files.
 * @module components/molecules/individual-setup
 */

import { html, define, dispatch } from 'hybrids';
// @ts-ignore
import '#molecules/emoji-builder/emoji-builder.js';

/**
 *
 */
function handleSubmit(host, e) {
  e.preventDefault();
  const m = host.manifest ? JSON.parse(host.manifest) : null;
  const name = host.name.trim() || m?.individual || '';
  if (!name) return;
  dispatch(host, 'setup-complete', {
    detail: { name, emoji: host.emoji, emojiParams: host.emojiParams, ancestry: host.ancestry },
    bubbles: true,
  });
}

export default define({
  tag: 'individual-setup',
  name: '',
  emoji: '👨',
  emojiParams: '',
  ancestry: '',
  variantCount: 0,
  format: '',
  filename: '',
  manifest: '',
  render: {
    value: ({ name, emoji, variantCount, format, filename, manifest }) => {
      const m = manifest ? JSON.parse(manifest) : null;
      const effectiveName = name || m?.individual || '';
      return html`
        <form class="individual-setup" onsubmit="${handleSubmit}">
          <div class="individual-setup__top">
            <div class="individual-setup__meta">
              ${m ? imputedStatus(m, filename) : textStatus(variantCount, format, filename)}
              <input
                type="text"
                class="individual-setup__input"
                placeholder="Name"
                value="${effectiveName}"
                oninput="${(h, e) => {
                  h.name = e.target.value;
                }}"
                autofocus
              />
            </div>
            <span class="individual-setup__preview">${emoji}</span>
          </div>
          <emoji-builder
            onemoji-change="${(host, e) => {
              host.emoji = e.detail.emoji || e.detail;
              host.emojiParams = e.detail.params || '';
            }}"
          ></emoji-builder>
          <label class="individual-setup__ancestry">
            <app-icon name="earth" size="sm"></app-icon>
            <select
              onchange="${(host, e) => {
                host.ancestry = e.target.value;
              }}"
            >
              <option value="">Ancestry: Global (default)</option>
              <option value="NFE">European</option>
              <option value="FIN">Finnish</option>
              <option value="AFR">African</option>
              <option value="EAS">East Asian</option>
              <option value="SAS">South Asian</option>
              <option value="AMR">American</option>
              <option value="ASJ">Ashkenazi</option>
              <option value="MID">Middle Eastern</option>
            </select>
            <span class="individual-setup__ancestry-hint">
              Select the ancestry background for this individual for better score normalization.
            </span>
          </label>
          <div class="individual-setup__actions">
            <button
              type="button"
              class="btn btn-ghost"
              onclick="${(host) => dispatch(host, 'setup-cancel', { bubbles: true })}"
            >
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled="${!effectiveName.trim()}">
              <app-icon name="zap" size="sm"></app-icon> Score
            </button>
          </div>
        </form>
      `;
    },
    shadow: false,
  },
});

/**
 *
 */
function imputedStatus(m, filename) {
  const total = (m.totalVariants || 0).toLocaleString();
  const geno = (m.genotypedVariants || 0).toLocaleString();
  const imp = (m.imputedVariants || 0).toLocaleString();
  const chrCount = m.chromosomes ? Object.keys(m.chromosomes).length : 0;
  return html`
    <div class="individual-setup__status-grid">
      <span><app-icon name="shield-check" size="sm"></app-icon> Verified .asili</span>
      <span><app-icon name="dna" size="sm"></app-icon> ${total} variants</span>
      <span><app-icon name="flask-conical" size="sm"></app-icon> ${geno} geno · ${imp} imp</span>
      ${chrCount
        ? html`<span
            ><app-icon name="git-branch" size="sm"></app-icon> ${chrCount} chromosomes</span
          >`
        : html``}
      ${filename
        ? html`<span><app-icon name="document" size="sm"></app-icon> ${filename}</span>`
        : html``}
    </div>
  `;
}

/**
 *
 */
function textStatus(count, format, filename) {
  return html`
    <div class="individual-setup__status-grid">
      <span><app-icon name="check" size="sm"></app-icon> ${format} detected</span>
      <span><app-icon name="dna" size="sm"></app-icon> ${count.toLocaleString()} variants</span>
      ${filename
        ? html`<span><app-icon name="document" size="sm"></app-icon> ${filename}</span>`
        : html``}
    </div>
  `;
}
