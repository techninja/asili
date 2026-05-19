/**
 * Scoring screen — fullscreen visualization during scoring.
 * Keeps screen alive via animation + wake lock. Tap to dismiss.
 * @module components/organisms/scoring-screen
 */

import { html, define } from 'hybrids';

/** @param {number} n */
const fmtN = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;

/** @param {number} s */
const fmtT = (s) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default define({
  tag: 'scoring-screen',
  visible: false,
  traitName: '',
  done: 0,
  total: 1,
  chrDone: 0,
  chrTotal: 0,
  rate: 0,
  eta: 0,
  clock: {
    value: '',
    connect: (host) => {
      const tick = () => {
        host.clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };
      tick();
      const iv = setInterval(tick, 10_000);
      return () => clearInterval(iv);
    },
  },
  render: {
    value: ({ visible, traitName, done, total, chrDone, chrTotal, rate, eta, clock }) => {
      if (!visible) return html``;
      const pct = total > 0 ? ((done / total) * 100).toFixed(1) : '0';
      const chrPct = chrTotal > 0 ? Math.round((chrDone / chrTotal) * 100) : 0;
      return html`
        <div class="ss" onclick="${dismiss}">
          <div class="ss__helix">${helixDots()}</div>
          <div class="ss__content">
            <img src="/logo.svg" alt="asili" class="ss__logo" />
            <time class="ss__clock">${clock}</time>
            <div class="ss__bars">
              <div class="ss__bar">
                <div class="ss__fill ss__fill--total" style="${{ width: `${pct}%` }}"></div>
              </div>
              <div class="ss__bar ss__bar--chr">
                <div class="ss__fill ss__fill--chr" style="${{ width: `${chrPct}%` }}"></div>
              </div>
            </div>
            <p class="ss__trait">${traitName || 'Preparing…'}</p>
            <p class="ss__stats">
              ${done}/${total}
              traits${rate > 0 ? html` · ${fmtN(Math.round(rate))}/s` : html``}${eta > 0
                ? html` · ~${fmtT(eta)}`
                : html``}
            </p>
            <p class="ss__hint">tap anywhere to return</p>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host */
function dismiss(host) {
  host.visible = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/** Generate CSS-animated helix dot pairs */
function helixDots() {
  const dots = [];
  for (let i = 0; i < 20; i++) {
    dots.push(
      html`<div class="ss__dot-pair" style="${{ animationDelay: `${i * -0.15}s` }}">
        <span class="ss__dot ss__dot--a"></span>
        <span class="ss__dot ss__dot--b"></span>
      </div>`,
    );
  }
  return dots;
}
