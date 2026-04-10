/**
 * Upload zone molecule — drag & drop or file picker for DNA files.
 * Dispatches 'file-selected' with the File object.
 * The file input overlays the zone so real user clicks open the dialog.
 * @module components/molecules/upload-zone
 */

import { html, define, dispatch } from 'hybrids';

/** @param {object & HTMLElement} host */
async function handleDrop(host, e) {
  e.preventDefault();
  host.dragover = false;
  const item = e.dataTransfer?.items?.[0];
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  let handle = null;
  if (item?.getAsFileSystemHandle) {
    try {
      handle = await item.getAsFileSystemHandle();
    } catch (e) {
      console.error(e);
      /* unsupported */
    }
  }
  dispatch(host, 'file-selected', { detail: { file, handle }, bubbles: true });
}

/** @param {object & HTMLElement} host */
function handleInput(host, e) {
  const file = e.target.files?.[0];
  if (file) dispatch(host, 'file-selected', { detail: { file, handle: null }, bubbles: true });
  e.target.value = '';
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
            Drop your DNA file here or <span class="upload-zone__link">browse</span>
          </p>
          <p class="upload-zone__hint">
            23andMe, AncestryDNA, MyHeritage, FTDNA, VCF, or .asili imputed
          </p>
        </div>
        <input
          type="file"
          accept=".txt,.csv,.tsv,.vcf,.zip,.parquet,.asili"
          class="upload-zone__input"
          onchange="${handleInput}"
          disabled="${disabled}"
        />
      </div>
    `,
    shadow: false,
  },
});
