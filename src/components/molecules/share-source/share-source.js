/**
 * Share source — generates QR offer and accepts answer to establish connection.
 * Keeps QR visible after first connection for additional viewers / reconnection.
 * @module components/molecules/share-source
 */

import { html, define } from 'hybrids';
import {
  startSharing,
  submitAnswer,
  copyLink,
  startScan,
  cancelScan,
  stopSharing,
} from './share-source-handlers.js';

export default define({
  tag: 'share-source',
  state: 'idle', // idle | loading | offering | scanning
  qrSvg: '',
  offerText: '',
  answerInput: '',
  error: '',
  viewers: 0,
  render: {
    value: ({ state, qrSvg, offerText, answerInput, error, viewers }) => {
      if (state === 'idle') {
        return html`
          <div class="share-source">
            <button class="btn" onclick="${startSharing}">Start Sharing</button>
          </div>
        `;
      }
      if (state === 'loading') {
        return html`
          <div class="share-source">
            <div class="share-source__loading">
              <p>Generating connection code…</p>
              <div class="share-source__spinner"></div>
            </div>
          </div>
        `;
      }
      if (state === 'scanning') {
        return html`
          <div class="share-source">
            <p class="share-source__status">Point camera at the QR on their screen:</p>
            <div class="share-source__scan-container">
              <video class="share-source__video" id="share-scan-video" playsinline></video>
              <div class="share-source__scan-overlay">
                <div class="share-source__scan-reticle"></div>
              </div>
              <p class="share-source__scan-hint">Hold steady · Fill the frame</p>
            </div>
            ${error ? html`<p class="share-source__error">${error}</p>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="${cancelScan}">Cancel</button>
          </div>
        `;
      }
      if (state === 'offering') {
        return html`
          <div class="share-source">
            ${viewers > 0
              ? html`<p class="share-source__connected">
                  🟢 ${viewers} device${viewers !== 1 ? 's' : ''} viewing
                </p>`
              : ''}
            <p class="share-source__status">Scan with another device to connect:</p>
            ${qrSvg
              ? html`<div class="share-source__qr" innerHTML="${qrSvg}"></div>`
              : html`<div class="share-source__qr-placeholder">
                  <div class="share-source__pulse"></div>
                </div>`}
            <div class="share-source__link">
              <button class="btn btn-sm btn-ghost" onclick="${copyLink}">📋 Copy Link</button>
            </div>
            <p class="share-source__status">Then scan or paste their response code:</p>
            <div class="share-source__actions">
              <button class="btn btn-sm" onclick="${startScan}">📷 Scan</button>
            </div>
            <div class="share-source__input">
              <input
                type="text"
                placeholder="Or paste code here"
                value="${answerInput}"
                oninput="${(host, e) => {
                  host.answerInput = e.target.value;
                }}"
              />
              <button class="btn btn-sm" onclick="${submitAnswer}">Connect</button>
            </div>
            ${error ? html`<p class="share-source__error">${error}</p>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="${stopSharing}">Stop Sharing</button>
          </div>
        `;
      }
      return html``;
    },
    shadow: false,
  },
});
