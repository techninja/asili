/**
 * Upload panel — header drawer overlay for adding individuals.
 * @module pages/beta/beta-upload-panel
 */

import { html } from 'hybrids';
import { handleFile, handleSetup } from './beta-sections.js';

/** Upload panel — slides down from header as an overlay drawer */
export function uploadPanel(host, cancelFn) {
  const isParsing = host.parseStatus === 'parsing';
  const isSetup = host.parseStatus === 'setup';
  const isError = host.parseStatus === 'error';
  const closeable = !isParsing;
  const cls = host.closingUpload ? 'beta-view__upload--closing' : '';
  return html`
    <div class="${cls}">
      ${closeable ? backdrop(cancelFn) : html``}
      <div class="beta-view__upload-panel">
        ${!isParsing && !isSetup && !isError
          ? html`<upload-zone onfile-selected="${handleFile}"></upload-zone>`
          : html``}
        ${isParsing ? parsingInline(host) : html``}
        ${isSetup ? setupInline(host, cancelFn) : html``}
        ${isError ? errorInline(host, cancelFn) : html``}
      </div>
    </div>
  `;
}

/**
 *
 */
function backdrop(cancelFn) {
  return html`<div
    class="beta-view__upload-backdrop"
    onclick="${(h) => {
      h.closingUpload = true;
      setTimeout(() => {
        h.showUpload = false;
        h.closingUpload = false;
        cancelFn(h);
      }, 200);
    }}"
  ></div>`;
}

/**
 *
 */
function parsingInline(host) {
  return html`
    <div class="beta-view__status">
      <span class="beta-view__spinner">🧬</span>
      <p>
        ${host.parsedCount > 0 ? `${host.parsedCount.toLocaleString()} variants` : 'Reading file…'}
      </p>
    </div>
  `;
}

/**
 *
 */
function errorInline(host, cancelFn) {
  return html`
    <div class="beta-view__error">
      <p class="beta-view__error-icon">❌</p>
      <p class="beta-view__error-msg">${host.parseError}</p>
      <button class="btn btn-ghost" onclick="${cancelFn}">Try again</button>
    </div>
  `;
}

/**
 *
 */
function setupInline(host, cancelFn) {
  return html`
    <individual-setup
      variantCount="${host.parsedCount}"
      format="${host.parsedFormat}"
      filename="${host.parsedFilename}"
      manifest="${host._manifest || ''}"
      onsetup-complete="${handleSetup}"
      onsetup-cancel="${cancelFn}"
    ></individual-setup>
  `;
}
