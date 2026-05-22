/**
 * Upload zone molecule — drag & drop or file picker for DNA files.
 * Uses File System Access API when available for persistent handles.
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
    } catch {
      /* unsupported */
    }
  }
  dispatch(host, 'file-selected', { detail: { file, handle }, bubbles: true });
}

/** @param {object & HTMLElement} host */
async function handleClick(host) {
  if (host.disabled || host._picking) return;
  host._picking = true;
  console.log('[upload-zone] handleClick triggered');
  // Prefer File System Access API — returns a persistent handle
  // @ts-ignore — showOpenFilePicker is Chrome-only
  if (window.showOpenFilePicker) {
    try {
      console.log('[upload-zone] opening showOpenFilePicker...');
      // @ts-ignore
      const [fh] = await window.showOpenFilePicker({
        types: [
          {
            description: 'DNA files',
            accept: { '*/*': ['.txt', '.csv', '.tsv', '.vcf', '.asili'] },
          },
        ],
      });
      const file = await fh.getFile();
      console.log('[upload-zone] file selected:', file.name, file.size);
      dispatch(host, 'file-selected', { detail: { file, handle: fh }, bubbles: true });
    } catch (e) {
      console.log('[upload-zone] picker cancelled or error:', e);
    }
    host._picking = false;
    return;
  }
  // Fallback: trigger hidden file input
  console.log('[upload-zone] fallback: hidden input click');
  host.querySelector('.upload-zone__input')?.click();
  host._picking = false;
}

/** @param {object & HTMLElement} host */
function handleInput(host, e) {
  const file = e.target.files?.[0];
  if (file) dispatch(host, 'file-selected', { detail: { file, handle: null }, bubbles: true });
  e.target.value = '';
}

/** @type {boolean} */
const HAS_PICKER = 'showOpenFilePicker' in window;

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
        onclick="${handleClick}"
      >
        <div class="upload-zone__content">
          <span class="upload-zone__icon">📁</span>
          <p class="upload-zone__text">
            <span class="upload-zone__text--desktop">Drop your DNA file here or </span
            ><span class="upload-zone__link">Choose file</span>
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
          onclick="${(host, e) => e.stopPropagation()}"
        />
      </div>
    `,
    shadow: false,
  },
});
