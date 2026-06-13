/**
 * Share viewer — accepts an offer from route param, generates answer code for pairing.
 * Rendered inside pair-view when user scans QR and lands on /pair/:offer.
 * @module components/molecules/share-viewer
 */

import { html, define } from 'hybrids';
import { isConnected } from '#utils/peer-rtc.js';
import { generateAnswer, copyCode, retry, navigateToResults } from './share-viewer-handlers.js';

export default define({
  tag: 'share-viewer',
  offer: {
    value: '',
    connect(host) {
      requestAnimationFrame(() => {
        if (host.offer && host.state === 'generating') generateAnswer(host);
      });
    },
    observe(host, val) {
      if (val && host.state === 'generating') generateAnswer(host);
    },
  },
  answerCode: '',
  answerQr: '',
  state: {
    value: 'generating', // generating | waiting | connected | error
    connect(host) {
      if (isConnected()) {
        host.state = 'connected';
        return;
      }
      const onVis = () => {
        if (document.visibilityState === 'visible' && isConnected() && host.state === 'waiting') {
          host.state = 'connected';
          navigateToResults();
        }
      };
      document.addEventListener('visibilitychange', onVis);
      return () => document.removeEventListener('visibilitychange', onVis);
    },
  },
  error: '',
  render: {
    value: (host) => {
      const { state, answerCode, answerQr, error } = host;
      if (state === 'generating') {
        return html`
          <div class="share-viewer">
            <div class="share-viewer__loading">
              <p>Setting up secure connection…</p>
              <div class="share-viewer__spinner"></div>
            </div>
          </div>
        `;
      }
      if (state === 'waiting') {
        return html`
          <div class="share-viewer">
            <p class="share-viewer__label">Show this QR to the other device's camera:</p>
            ${answerQr
              ? html`<div class="share-viewer__qr" innerHTML="${answerQr}"></div>`
              : html`<div class="share-viewer__qr-placeholder">
                  <div class="share-viewer__pulse"></div>
                </div>`}
            <p class="share-viewer__label">Or copy the code:</p>
            <div class="share-viewer__code">${answerCode}</div>
            <button class="btn btn-sm" onclick="${copyCode}">📋 Copy Code</button>
            <p class="share-viewer__hint">Enter or scan this on the other device to connect.</p>
          </div>
        `;
      }
      if (state === 'connected') {
        return html`
          <div class="share-viewer">
            <p class="share-viewer__connected">✅ Connected!</p>
            <a href="/beta" class="btn">View Results →</a>
          </div>
        `;
      }
      return html`
        <div class="share-viewer">
          <p class="share-viewer__error">${error}</p>
          <button class="btn btn-sm" onclick="${retry}">Try Again</button>
        </div>
      `;
    },
    shadow: false,
  },
});
