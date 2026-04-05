/**
 * Beta view — the app during development.
 * Upload → parse → store → display variant count → trait grid.
 * @module pages/beta
 */

import { html, define, store, router } from 'hybrids';
import AppState from '../../store/AppState.js';
import '../../components/molecules/upload-zone/upload-zone.js';
import '../../components/atoms/confidence-badge/confidence-badge.js';
import '../../components/organisms/trait-grid/trait-grid.js';
import { handleFileSelected } from './upload-handler.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta' },
  state: store(AppState),
  parseStatus: '',
  parseError: '',
  parsedCount: 0,
  parsedFormat: '',
  individualName: '',
  render: {
    value: (host) => html`
      <div class="beta-view">
        <header class="beta-view__header">
          <a href="/" class="beta-view__logo">
            <img src="/logo.svg" alt="" class="beta-view__logo-img" />
            <span>asili</span>
          </a>
          <span class="beta-view__tag">beta</span>
        </header>

        <main class="beta-view__main">
          ${host.parseStatus === ''
            ? uploadSection()
            : host.parseStatus === 'parsing'
              ? parsingSection(host)
              : host.parseStatus === 'done'
                ? doneSection(host)
                : errorSection(host)}
        </main>
      </div>
    `,
    shadow: false,
  },
});

/** Upload prompt */
function uploadSection() {
  return html`
    <h1 class="beta-view__title">Upload your DNA</h1>
    <p class="beta-view__sub">Your file stays on your device. Nothing is uploaded to any server.</p>
    <upload-zone onfile-selected="${handleFileSelected}"></upload-zone>
  `;
}

/** @param {object} host */
function parsingSection(host) {
  return html`
    <div class="beta-view__status">
      <span class="beta-view__spinner">🧬</span>
      <p>Parsing ${host.parsedFormat || 'DNA'} file…</p>
      <p class="beta-view__count">${host.parsedCount.toLocaleString()} variants</p>
    </div>
  `;
}

/** @param {object} host */
function doneSection(host) {
  return html`
    <div class="beta-view__result">
      <span class="beta-view__check">✅</span>
      <h2>${host.individualName} — ${host.parsedCount.toLocaleString()} variants</h2>
      <p class="beta-view__count">${host.parsedFormat} format</p>
      <button class="btn btn-ghost" onclick="${resetUpload}">Upload another</button>
    </div>
    <trait-grid></trait-grid>
  `;
}

/** @param {object} host */
function errorSection(host) {
  return html`
    <div class="beta-view__error">
      <span>❌</span>
      <p>${host.parseError}</p>
      <button class="btn btn-secondary" onclick="${resetUpload}">Try again</button>
    </div>
  `;
}

/** @param {object} host */
function resetUpload(host) {
  host.parseStatus = '';
  host.parseError = '';
  host.parsedCount = 0;
  host.parsedFormat = '';
}
