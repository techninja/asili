/**
 * Hero canvas — animated particle network background.
 * @module components/atoms/hero-canvas
 */

import { html, define } from 'hybrids';

const PARTICLE_COUNT = 90;
const CONNECT_DIST = 160;
const SPEED = 0.4;

/** @param {HTMLCanvasElement} canvas */
function initCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, particles, raf;

  /**
   *
   */
  function resize() {
    const host = canvas.closest('hero-canvas');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const oldW = w;
    const oldH = h;
    w = canvas.width = rect.width;
    h = canvas.height = rect.height;
    if (particles && oldW && oldH) {
      for (const p of particles) {
        p.x = (p.x / oldW) * w;
        p.y = (p.y / oldH) * h;
      }
    }
  }

  /**
   *
   */
  function createParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r: Math.random() * 2.5 + 1,
    }));
  }

  /**
   *
   */
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const dotColor = isDark ? 'rgba(129,140,248,0.7)' : 'rgba(99,102,241,0.45)';

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DIST) {
          const alpha = 1 - dist / CONNECT_DIST;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = isDark
            ? `rgba(129,140,248,${0.18 * alpha})`
            : `rgba(99,102,241,${0.14 * alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }

  const host = canvas.closest('hero-canvas');
  resize();
  createParticles();
  draw();

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}

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
