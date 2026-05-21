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
import * as idb from '/packages/core/src/data-layer/idb.js';

const ACTIVE_STATES = new Set(['scoring', 'paused', 'init', 'blocked']);

export default define({
  tag: 'floating-bar',
  prevHref: '',
  nextHref: '',
  expanded: false,
  /** @type {string} JSON cache of individual meta */
  _indCache: '{}',
  _tick: {
    value: 0,
    connect: (host, _key, invalidate) => {
      let lastWidth = 0;
      let observer = null;
      let flipPending = false;

      const doFlip = () => {
        if (flipPending) return;
        flipPending = true;
        requestAnimationFrame(() => {
          flipPending = false;
          const bar = host.querySelector('.floating-bar');
          if (!bar || !lastWidth) return;
          const newWidth = bar.offsetWidth;
          if (Math.abs(newWidth - lastWidth) > 4) {
            bar.style.transition = 'none';
            bar.style.width = lastWidth + 'px';
            void bar.offsetWidth;
            requestAnimationFrame(() => {
              bar.style.transition = '';
              bar.style.width = newWidth + 'px';
              const onEnd = () => {
                bar.style.width = '';
                bar.removeEventListener('transitionend', onEnd);
              };
              bar.addEventListener('transitionend', onEnd);
            });
          }
          lastWidth = newWidth;
        });
      };

      const unsub = subscribe(() => {
        const bar = host.querySelector('.floating-bar');
        if (bar) lastWidth = bar.offsetWidth;
        host._tick++;
        invalidate();
      });

      observer = new MutationObserver(doFlip);
      observer.observe(host, { childList: true, subtree: true, characterData: true });

      return () => {
        unsub();
        observer.disconnect();
      };
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

      // Warm individual cache when expanded
      if (host.expanded && state.byIndividual) {
        const cache = JSON.parse(host._indCache);
        for (const id of Object.keys(state.byIndividual)) {
          if (!cache[id]) {
            idb.get('individuals', id).then((ind) => {
              if (ind) {
                const c = JSON.parse(host._indCache);
                c[id] = { name: ind.name, emoji: ind.emoji };
                host._indCache = JSON.stringify(c);
              }
            });
          }
        }
      }

      return html`
        <div class="floating-bar ${hasError ? 'floating-bar--error' : ''} ${host.expanded ? 'floating-bar--expanded' : ''}">
          ${hasError ? errorContent(host, state) : html``}
          ${hasScoring ? scoringContent(host, state, status) : html``}
          ${host.expanded ? detailPanel(state, hasError, JSON.parse(host._indCache)) : html``}
          ${hasPager ? pagerContent(host.prevHref, host.nextHref) : html``}
        </div>
      `;
    },
    shadow: false,
  },
});

function toggleExpand(host) {
  host.expanded = !host.expanded;
}

function errorContent(host, state) {
  const msg = state.lastError || `${state.errors} trait${state.errors !== 1 ? 's' : ''} failed`;
  const short = msg.length > 60 ? msg.slice(0, 57) + '…' : msg;
  return html`<div class="floating-bar__section">
    <button class="floating-bar__stats floating-bar__stats--error floating-bar__stats--tappable" onclick="${(h) => toggleExpand(h)}" title="${msg}">
      <app-icon name="alert"></app-icon> ${short}
    </button>
  </div>`;
}

function scoringContent(host, state, status) {
  // Done — nothing left to score
  if (state.pending === 0 && state.done > 0) {
    return html`<div class="floating-bar__section">
      <span class="floating-bar__icon"><app-icon name="check-done"></app-icon></span>
      <button class="floating-bar__stats floating-bar__stats--tappable" onclick="${(h) => toggleExpand(h)}">
        ${state.done}/${state.total} scored${state.errors ? html` · ${state.errors} failed` : html``}
      </button>
    </div>`;
  }

  // Paused
  if (status === 'paused') {
    return html`<div class="floating-bar__section floating-bar__section--scoring">
      <span class="floating-bar__status-icon" title="Paused">
        <app-icon name="octagon-pause"></app-icon>
      </span>
      <button class="floating-bar__stats floating-bar__stats--tappable" onclick="${(h) => toggleExpand(h)}">
        ${state.done}/${state.total} scored${state.errors ? html` · ${state.errors} failed` : html``}
      </button>
      <button class="floating-bar__action floating-bar__action--resume" onclick="${() => handleResume()}" title="Resume">
        <app-icon name="play"></app-icon>
      </button>
    </div>`;
  }

  // Actively scoring
  const pct = state.total > 0 ? ((state.done / state.total) * 100).toFixed(1) : 0;
  const subPct = state.subProgress > 0 ? (state.subProgress * 100).toFixed(1) : 0;
  const trait = state.currentTraitName || '';
  const rate = state.rate > 0 ? fmtN(Math.round(state.rate)) + ' var/s' : '';
  const dlRate = state.transferRate > 0 ? fmtBits(state.transferRate) : (state.done > 0 ? '-- Mbps' : '');
  const eta = state.etaSeconds > 0 ? '~' + fmtT(state.etaSeconds) : '';

  return html`
    <div class="floating-bar__section floating-bar__section--scoring">
      <div class="floating-bar__spinner-wrap">
        <span class="floating-bar__spinner"><app-icon name="badge"></app-icon></span>
        <button class="floating-bar__action" onclick="${() => handlePause()}" title="Pause">
          <app-icon name="pause"></app-icon>
        </button>
      </div>
      <div class="floating-bar__tracks">
        <div class="floating-bar__track">
          <div class="floating-bar__fill" style="${{ width: `${pct}%` }}"></div>
        </div>
        <div class="floating-bar__subtrack">
          <div class="floating-bar__subfill" style="${{ width: `${subPct}%` }}"></div>
        </div>
      </div>
      <button class="floating-bar__stats floating-bar__stats--tappable" onclick="${(h) => toggleExpand(h)}">
        <span class="floating-bar__stats-line">${trait ? html`${trait}` : html`Scoring`}</span>
        <span class="floating-bar__stats-line">${state.done}/${state.total}${rate
          ? html` · ${rate}`
          : html``}${dlRate
          ? html` · ${dlRate}`
          : html``}${eta ? html` · ${eta}` : html``}</span>
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

function detailPanel(state, hasError, indCache) {
  const individuals = Object.values(state.byIndividual || {});
  const transferBytes = state.transferBytes || {};
  const totalTransfer = Object.values(transferBytes).reduce((s, v) => s + v, 0);
  return html`
    <div class="floating-bar__detail">
      ${hasError && state.lastError ? html`<div class="floating-bar__detail-row floating-bar__detail-row--error">${state.lastError}</div>` : html``}
      <div class="floating-bar__detail-row">
        <span>Traits:</span> <span>${state.done} done · ${state.errors} failed · ${state.pending} pending</span>
      </div>
      ${state.rate > 0 ? html`<div class="floating-bar__detail-row">
        <span>Throughput:</span> <span>${fmtN(Math.round(state.rate))} variants/sec${state.transferRate > 0 ? ` · ${fmtBits(state.transferRate)}` : ''}</span>
      </div>` : html``}
      ${state.totalVariantsScored > 0 ? html`<div class="floating-bar__detail-row">
        <span>Variants scored:</span> <span>${fmtN(state.totalVariantsScored)}</span>
      </div>` : html``}
      ${totalTransfer > 0 ? html`<div class="floating-bar__detail-row">
        <span>Data scanned:</span> <span>${fmtBytes(totalTransfer)}</span>
      </div>` : html``}
      ${state.etaSeconds > 0 ? html`<div class="floating-bar__detail-row">
        <span>ETA:</span> <span>${fmtT(state.etaSeconds)}</span>
      </div>` : html``}
      ${individuals.length > 1 ? html`
        <div class="floating-bar__detail-heading">Per individual</div>
        ${individuals.map((ind) => {
          const meta = indCache[ind.id];
          const label = meta ? `${meta.emoji} ${meta.name}` : ind.id.slice(0, 8);
          const indBytes = transferBytes[ind.id];
          return html`<div class="floating-bar__detail-row">
            <span>${label}</span> <span>${ind.done}/${ind.total}${ind.errors ? ` · ${ind.errors} err` : ''}${indBytes ? ` · ${fmtBytes(indBytes)} scanned` : ''}</span>
          </div>`;
        })}
      ` : html``}
    </div>
  `;
}

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

/** @param {number} b */
const fmtBytes = (b) => {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
};

/** @param {number} bytesPerSec — formats as bits/sec (Mbps, Kbps) */
const fmtBits = (bytesPerSec) => {
  const bps = bytesPerSec * 8;
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
};
