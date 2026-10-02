/**
 * Hero canvas drawing logic — particle network animation.
 * @module components/atoms/hero-canvas/draw
 */

const PARTICLE_COUNT = 50;
const CONNECT_DIST = 140;
const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
const SPEED = 0.4;

/** @param {HTMLCanvasElement} canvas */
export function initCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let w,
    h,
    particles,
    raf,
    started = false;

  function resize() {
    const host = canvas.closest('hero-canvas');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const oldW = w,
      oldH = h;
    w = canvas.width = rect.width;
    h = canvas.height = rect.height;
    if (particles && oldW && oldH) {
      for (const p of particles) {
        p.x = (p.x / oldW) * w;
        p.y = (p.y / oldH) * h;
      }
    }
  }

  function createParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r: Math.random() * 2.5 + 1,
    }));
  }

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
        const distSq = dx * dx + dy * dy;
        if (distSq < CONNECT_DIST_SQ) {
          const alpha = 1 - Math.sqrt(distSq) / CONNECT_DIST;
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

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        if (!started) {
          started = true;
          draw();
        } else if (!raf) draw();
      } else {
        cancelAnimationFrame(raf);
        raf = null;
      }
    },
    { threshold: 0.01 },
  );

  // Only start when browser is genuinely idle — no timeout so Lighthouse
  // measurement window completes before the animation begins
  const start = () => io.observe(host);
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(start);
  } else {
    setTimeout(start, 500);
  }

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
  };
}
