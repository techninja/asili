/**
 * Floating bar scoring state renderers — error, blocked, paused, active.
 * @module components/molecules/floating-bar/floating-bar-scoring
 */

import { html, dispatch } from 'hybrids';
import { handlePause, handleResume } from '#pages/beta/scoring-controller.js';
import { handleResumePermission } from '#pages/beta/scoring-actions.js';
import { getImputedNeedingReupload } from '#utils/scoring-queue.js';
import { fmtN, fmtRate, fmtT } from './floating-bar-helpers.js';

/** @param {Function} toggleExpand */
export function errorContent(host, state, toggleExpand) {
  const msg = state.lastError || `${state.errors} trait${state.errors !== 1 ? 's' : ''} failed`;
  const short = msg.length > 60 ? msg.slice(0, 57) + '…' : msg;
  return html`<div class="floating-bar__section">
    <button
      class="floating-bar__stats floating-bar__stats--error floating-bar__stats--tappable"
      onclick="${(h) => toggleExpand(h)}"
      title="${msg}"
    >
      <app-icon name="alert"></app-icon> ${short}
    </button>
  </div>`;
}

/** @param {Function} toggleExpand */
export function scoringContent(host, state, status, toggleExpand) {
  if (state.pending === 0 && state.done > 0) {
    return html`<div class="floating-bar__section">
      <span class="floating-bar__icon"><app-icon name="check-done"></app-icon></span>
      <button
        class="floating-bar__stats floating-bar__stats--tappable"
        onclick="${(h) => toggleExpand(h)}"
      >
        ${state.done}/${state.total}
        scored${state.errors ? html` · ${state.errors} failed` : html``}
      </button>
    </div>`;
  }

  if (status === 'blocked') {
    const need = getImputedNeedingReupload().length;
    return html`<div class="floating-bar__section floating-bar__section--scoring">
      <span class="floating-bar__status-icon" title="Waiting for file access">
        <app-icon name="lock"></app-icon>
      </span>
      <span class="floating-bar__stats">
        ${need} imputed file${need !== 1 ? 's' : ''} need${need === 1 ? 's' : ''} access
      </span>
      <button
        class="floating-bar__action floating-bar__action--resume"
        onclick="${() => handleResumePermission()}"
        title="Grant access"
      >
        <app-icon name="unlock"></app-icon>
      </button>
    </div>`;
  }

  if (status === 'paused') {
    return html`<div class="floating-bar__section floating-bar__section--scoring">
      <span class="floating-bar__status-icon" title="Paused">
        <app-icon name="octagon-pause"></app-icon>
      </span>
      <button
        class="floating-bar__stats floating-bar__stats--tappable"
        onclick="${(h) => toggleExpand(h)}"
      >
        ${state.done}/${state.total}
        scored${state.errors ? html` · ${state.errors} failed` : html``}
      </button>
      <button
        class="floating-bar__action floating-bar__action--resume"
        onclick="${() => handleResume()}"
        title="Resume"
      >
        <app-icon name="play"></app-icon>
      </button>
    </div>`;
  }

  // Actively scoring
  const pct = state.total > 0 ? ((state.done / state.total) * 100).toFixed(1) : 0;
  const subPct = state.subProgress > 0 ? (state.subProgress * 100).toFixed(1) : 0;
  const trait = state.currentTraitName || '';
  const rate = state.rate > 0 ? fmtN(Math.round(state.rate)) + ' var/s' : '';
  const dlRate =
    state.transferRate > 0 ? fmtRate(state.transferRate) : state.done > 0 ? '-- MB/min' : '';
  const eta = state.etaSeconds > 0 ? '~' + fmtT(state.etaSeconds) : '';

  return html`
    <div class="floating-bar__section floating-bar__section--scoring">
      <div class="floating-bar__spinner-wrap">
        <span class="floating-bar__spinner"><app-icon name="badge"></app-icon></span>
        <button class="floating-bar__action" onclick="${() => handlePause()}" title="Pause">
          <app-icon name="pause"></app-icon>
        </button>
      </div>
      <div class="floating-bar__progress">
        <div class="floating-bar__tracks">
          <div class="floating-bar__track">
            <div class="floating-bar__fill" style="${{ width: `${pct}%` }}"></div>
          </div>
          <div class="floating-bar__subtrack">
            <div class="floating-bar__subfill" style="${{ width: `${subPct}%` }}"></div>
          </div>
        </div>
        <button
          class="floating-bar__stats floating-bar__stats--tappable"
          onclick="${(h) => toggleExpand(h)}"
        >
          <span class="floating-bar__stats-line">${trait ? html`${trait}` : html`Scoring`}</span>
          <span class="floating-bar__stats-line"
            >${state.done}/${state.total}${rate ? html` · ${rate}` : html``}${dlRate
              ? html` · ${dlRate}`
              : html``}${eta ? html` · ${eta}` : html``}</span
          >
        </button>
      </div>
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
