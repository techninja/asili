/**
 * Upload zone molecule — drag & drop or file picker for DNA files.
 * Dispatches 'file-selected' with the File object.
 * @module components/molecules/upload-zone
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {object} UploadZoneHost
 * @property {boolean} dragover
 * @property {boolean} disabled
 */

/** @param {UploadZoneHost & HTMLElement} host */
function handleDrop(host, e) {
  e.preventDefault();
  host.dragover = false;
  const file = e.dataTransfer?.files[0];
  if (file) dispatch(host, 'file-selected', { detail: file, bubbles: true });
}

/** @param {UploadZoneHost & HTMLElement} host */
function handleInput(host, e) {
  const file = e.target.files?.[0];
  if (file) dispatch(host, 'file-selected', { detail: file, bubbles: true });
}

export default define({
  tag: 'upload-zone',
  dragover: false,
  disabled: false,
  render: {
    value: ({ dragover, disabled }) => html`
      <div
        class="upload-zone ${dragover ? 'upload-zone--active' : ''} ${disabled
          ? 'upload-zone--disabled'
          : ''}"
        onclick="${(host, e) => {
          if (disabled || e.target.closest('label')) return;
          host.querySelector('.upload-zone__input')?.click();
        }}"
        ondragover="${(host, e) => {
          e.preventDefault();
          host.dragover = true;
        }}"
        ondragleave="${(host) => {
          host.dragover = false;
        }}"
        ondrop="${handleDrop}"
      >
        <div class="upload-zone__content">
          <span class="upload-zone__icon">📁</span>
          <p class="upload-zone__text">
            Drop your DNA file here or
            <label class="upload-zone__link">
              browse
              <input
                type="file"
                accept=".txt,.csv,.tsv,.vcf,.zip"
                class="upload-zone__input"
                onchange="${handleInput}"
                disabled="${disabled}"
              />
            </label>
          </p>
          <p class="upload-zone__hint">23andMe, AncestryDNA, MyHeritage, FamilyTreeDNA, or VCF</p>
        </div>
      </div>
    `,
    shadow: false,
  },
});
