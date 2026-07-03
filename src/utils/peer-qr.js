/**
 * Peer QR — generates QR codes with Asili logo center using uqr.
 * Uses BarcodeDetector API for scanning (Chrome/Edge native).
 * @module utils/peer-qr
 */

import { renderSVG } from 'uqr';

/* global BarcodeDetector */

/**
 * Generate a QR code SVG string with the Asili logo centered.
 * Uses error correction level H for short data, drops to L for long payloads.
 * @param {string} data
 * @returns {string} SVG markup
 */
export function generate(data) {
  // H (30% correction) allows logo overlay but caps at ~1273 alphanumeric chars
  // L (7% correction) handles up to ~4296 alphanumeric chars
  const ecc = data.length > 1000 ? 'L' : 'H';
  const qrSvg = renderSVG(data, { ecc, border: 2 });

  // Only overlay logo when using high error correction (short data)
  if (ecc !== 'H') return qrSvg;

  // Extract viewBox size from uqr output (e.g. "0 0 410 410")
  const vbMatch = qrSvg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const size = vbMatch ? Number(vbMatch[1]) : 410;

  // Logo occupies ~18% of the QR, centered
  const logoSize = Math.round(size * 0.18);
  const logoOffset = Math.round((size - logoSize) / 2);
  const logoPad = Math.round(logoSize * 0.1);

  // Inject logo overlay before closing </svg>
  const overlay = `
    <rect x="${logoOffset}" y="${logoOffset}" width="${logoSize}" height="${logoSize}"
          fill="white" rx="${Math.round(logoSize * 0.15)}"/>
    <image href="/logo.svg"
           x="${logoOffset + logoPad}" y="${logoOffset + logoPad}"
           width="${logoSize - logoPad * 2}" height="${logoSize - logoPad * 2}"/>
  `;

  return qrSvg.replace('</svg>', overlay + '</svg>');
}

/**
 * Scan a QR code using device camera.
 * Uses BarcodeDetector (Chrome/Edge native) with jsQR fallback (Linux, Firefox, Safari).
 * @param {HTMLVideoElement} [videoEl] - optional existing video element to use for preview
 * @returns {Promise<string>} decoded content
 */
export async function scan(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  const video = videoEl || document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();

  const useNative = 'BarcodeDetector' in window;
  const detector = useNative ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  const jsQR = useNative ? null : (await import('jsqr')).default;

  const canvas = useNative ? null : document.createElement('canvas');
  const ctx = canvas?.getContext('2d');

  return new Promise((resolve, reject) => {
    let stopped = false;

    const stop = () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };

    const check = async () => {
      if (stopped) return;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            stop();
            resolve(codes[0].rawValue);
            return;
          }
        } else {
          // jsQR fallback: draw frame to canvas, read pixel data
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, w, h);
            if (code) {
              stop();
              resolve(code.data);
              return;
            }
          }
        }
      } catch (e) {
        /* keep trying */
      }
      requestAnimationFrame(check);
    };
    check();
    setTimeout(() => {
      if (!stopped) {
        stop();
        reject(new Error('QR scan timeout (30s)'));
      }
    }, 30000);
  });
}
