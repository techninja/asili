/**
 * Floating bar — persistent bottom bar for scoring controls + trait pager.
 * Self-subscribes to global queue state so it works on any view.
 * Visible when scoring/paused/blocked/init, or on trait detail for pager.
 * Hidden when done (rescore lives in settings).
 * @module components/molecules/floating-bar
 */

import { html, define, dispatch } from 'hybrids';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
import { subscribe, getState } from '#utils/queue-state.js';
import { handlePause, handleResume } from '#pages/beta/scoring-controller.js';

const ACTIVE_STATES = new Set(['scoring', 'paused', 'init', 'blocked']);

export default define({
  tag: 'floating-bar',
  prevHref: '',
  nextHref: '',
  _tick: {
    value: 0,
    connect: (host, _key, invalidate) => {
      const unsub = subscribe(() => {
        host._tick++;
        invalidate();
      });
      return unsub;
    },
  },
  render: {
    value: (host) => {
      void host._tick;
      const state = getState();
      const status = state.paused ? 'paused' : state.running ? 'scoring' : '';
      const hasError = !state.running && !state.paused && state.errors > 0 && state.pending === 0;
      const hasScoring = ACTIVE_STATES.has(status);
      const hasPager = host.prevHref || host.nextHref;
      if (!hasScoring && !hasError && !hasPager) return html``;

      return html`
        <div class="floating-bar ${hasError ? 'floating-bar--error' : ''}">
          ${hasError ? errorContent(state) : html``}
          ${hasScoring ? scoringContent(host, state, status) : html``}
          ${hasPager ? pagerContent(host.prevHref, host.nextHref) : html``}
        </div>
      `;
    },
    shadow: false,
  },
});

/**
 *
 */
function errorContent(state) {
  const msg = state.lastError || `${state.errors} trait${state.errors !== 1 ? 's' : ''} failed`;
  const short = msg.length > 60 ? msg.slice(0, 57) + '…' : msg;
  return html`<div class="floating-bar__section">
    <span class="floating-bar__stats floating-bar__stats--error" title="${msg}">
      ⚠ ${short}
    </span>
  </div>`;
}

function scoringContent(host, state, status) {
  if (status === 'paused') {
    return html`<div class="floating-bar__section">
      <span class="floating-bar__stats">⏸ ${state.done}/${state.total} scored${state.errors ? html` · ${state.errors} failed` : html``}</span>
      <button class="floating-bar__action" onclick="${() => handleResume()}" title="Resume">
        <app-icon name="play"></app-icon>
      </button>
    </div>`;
  }

  // scoring
  const pct = state.total > 0 ? ((state.done / state.total) * 100).toFixed(1) : 0;
  const trait = state.currentTraitName || '';
  const rate = state.rate > 0 ? fmtN(Math.round(state.rate)) + '/s' : '';
  const eta = state.etaSeconds > 0 ? '~' + fmtT(state.etaSeconds) : '';

  return html`
    <div class="floating-bar__section floating-bar__section--scoring">
      <div class="floating-bar__progress">
        <div class="floating-bar__track">
          <div class="floating-bar__fill" style="${{ width: `${pct}%` }}"></div>
        </div>
        <span class="floating-bar__stats">
          ${trait ? html`${trait} · ` : html``}${state.done}/${state.total}${rate
            ? html` · ${rate}`
            : html``}${eta ? html` · ${eta}` : html``}
        </span>
      </div>
      <button class="floating-bar__action" onclick="${() => handlePause()}" title="Pause">
        <app-icon name="pause"></app-icon>
      </button>
      <button
        class="floating-bar__action"
        onclick="${(h) => dispatch(h, 'focus-mode', { bubbles: true })}"
        title="Focus mode"
      >
        <app-icon name="maximize"></app-icon>
      </button>
    </div>
  `;
}

/**
 *
 */
function pagerContent(prevHref, nextHref) {
  return html`
    <div class="floating-bar__pager">
      ${prevHref
        ? html`<a href="${prevHref}" class="floating-bar__btn" title="Previous trait">
            <app-icon name="step-back"></app-icon>
          </a>`
        : html`<span class="floating-bar__btn floating-bar__btn--disabled">
            <app-icon name="step-back"></app-icon>
          </span>`}
      ${nextHref
        ? html`<a href="${nextHref}" class="floating-bar__btn" title="Next trait">
            <app-icon name="step-forward"></app-icon>
          </a>`
        : html`<span class="floating-bar__btn floating-bar__btn--disabled">
            <app-icon name="step-forward"></app-icon>
          </span>`}
    </div>
  `;
}

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
