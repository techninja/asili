/**
 * Hero canvas — animated particle network background.
 * @module components/atoms/hero-canvas
 */

import { html, define } from 'hybrids';
import { initCanvas } from './hero-canvas-draw.js';

/**
 * @typedef {Object} HeroCanvasHost
 * @property {Function|undefined} cleanup
 */

/** @type {import('hybrids').Component<HeroCanvasHost>} */
export default define({
  tag: 'hero-canvas',
  cleanup: {
    value: undefined,
    connect(host) {
      requestAnimationFrame(() => {
        const c = host.querySelector('canvas');
        if (c) host.cleanup = initCanvas(c);
      });
      return () => {
        if (host.cleanup) host.cleanup();
      };
    },
  },
  render: {
    value: () => html`<canvas class="hero-canvas"></canvas>`,
    shadow: false,
  },
});
