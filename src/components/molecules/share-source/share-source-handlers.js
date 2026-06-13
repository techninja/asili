/**
 * Share source handlers — offer generation, scanning, answer submission.
 * @module components/molecules/share-source/share-source-handlers
 */

import { createOffer, acceptAnswer, close, onOpen, onData, viewerCount } from '#utils/peer-rtc.js';
import { startServing } from '#utils/peer-protocol.js';
import { generate as generateQR, scan as scanQR } from '#utils/peer-qr.js';
import { acquire, release } from '#utils/wake-lock.js';
import { pause as pauseScoring, resume as resumeScoring } from '#utils/scoring-queue.js';

/** Whether startServing has been called this session. */
let serving = false;

/** @param {object} host */
export async function generateNewOffer(host) {
  const offer = await createOffer();
  const url = `${location.origin}/pair/${offer}`;
  host.offerText = url;
  host.qrSvg = '';
  host.answerInput = '';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  host.qrSvg = generateQR(url);
}

/** @param {object} host */
export async function startSharing(host) {
  try {
    host.state = 'loading';
    await pauseScoring();
    await generateNewOffer(host);
    host.state = 'offering';
    if (!serving) {
      serving = true;
      startServing();
    }
    await acquire();
    onOpen(() => {
      host.viewers = viewerCount();
    });
    onData((msg) => {
      if (msg.type === '_disconnected') {
        host.viewers = viewerCount();
        if (host.viewers === 0) release();
      }
    });
  } catch (e) {
    host.error = e.message;
    host.state = 'idle';
  }
}

/** @param {object} host */
export async function submitAnswer(host) {
  try {
    host.error = '';
    if (viewerCount() > 0) return;
    await acceptAnswer(host.answerInput.trim());
  } catch (e) {
    host.error = 'Invalid code — try again';
  }
}

/** @param {object} host */
export function copyLink(host) {
  navigator.clipboard.writeText(host.offerText);
}

/** @param {object} host */
export async function startScan(host) {
  host.state = 'scanning';
  host.error = '';
  await new Promise((r) => requestAnimationFrame(r));
  const video = /** @type {HTMLVideoElement} */ (document.getElementById('share-scan-video'));
  try {
    const code = await scanQR(video);
    host.answerInput = code;
    host.state = 'offering';
    await submitAnswer(host);
  } catch (e) {
    host.error = e.message;
    host.state = 'offering';
  }
}

/** @param {object} host */
export function cancelScan(host) {
  const video = /** @type {HTMLVideoElement} */ (document.getElementById('share-scan-video'));
  if (video?.srcObject) {
    /** @type {MediaStream} */ (video.srcObject).getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  host.state = 'offering';
}

/** @param {object} host */
export function stopSharing(host) {
  close();
  release();
  resumeScoring();
  serving = false;
  host.state = 'idle';
  host.qrSvg = '';
  host.offerText = '';
  host.answerInput = '';
  host.viewers = 0;
}
