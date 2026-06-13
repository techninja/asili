/**
 * Share viewer handlers — offer acceptance, navigation, QR generation.
 * @module components/molecules/share-viewer/share-viewer-handlers
 */

import { acceptOffer, isConnected, onOpen } from '#utils/peer-rtc.js';
import { startViewing } from '#utils/peer-protocol.js';
import { enterViewerMode } from '#utils/peer-state.js';
import { generate as generateQR } from '#utils/peer-qr.js';

/** Module-level answer storage — survives component re-mounts. */
let savedAnswer = '';
let generating = false;

/** @param {object} host */
export async function generateAnswer(host) {
  if (generating) return;

  if (isConnected()) {
    navigateToResults();
    return;
  }

  if (savedAnswer) {
    host.answerCode = savedAnswer;
    host.state = 'waiting';
    await nextPaint();
    host.answerQr = generateQR(savedAnswer);
    onOpen(() => navigateToResults());
    return;
  }

  generating = true;
  try {
    host.state = 'generating';
    host.error = '';
    const answer = await acceptOffer(host.offer);
    savedAnswer = answer;
    host.answerCode = answer;
    host.state = 'waiting';
    await nextPaint();
    host.answerQr = generateQR(answer);
    startViewing();
    onOpen(() => {
      host.state = 'connected';
      enterViewerMode();
      setTimeout(() => navigateToResults(), 800);
    });
  } catch (e) {
    savedAnswer = '';
    host.state = 'error';
    host.error = 'Connection setup failed. Scan a fresh QR code from the source device.';
  } finally {
    generating = false;
  }
}

/**
 *
 */
export function navigateToResults() {
  window.history.pushState(null, '', '/beta');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** @param {object} host */
export function copyCode(host) {
  navigator.clipboard.writeText(host.answerCode);
}

/** @param {object} host */
export function retry(host) {
  host.state = 'generating';
  host.error = '';
  savedAnswer = '';
  generating = false;
  generateAnswer(host);
}

/** Wait for the browser to actually paint before continuing. */
function nextPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
