/**
 * Floating bar render helpers — detail panel, pager, formatters.
 * @module components/molecules/floating-bar/floating-bar-helpers
 */

import { html } from 'hybrids';

/** @param {number} n */
export const fmtN = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`;

/** @param {number} s */
export const fmtT = (s) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

/** @param {number} b */
export const fmtBytes = (b) => {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
};

/** @param {number} bytesPerSec */
export const fmtRate = (bytesPerSec) => {
  const mbPerMin = (bytesPerSec * 60) / 1e6;
  if (mbPerMin >= 1000) return `${(mbPerMin / 1000).toFixed(1)} GB/min`;
  if (mbPerMin >= 10) return `${Math.round(mbPerMin)} MB/min`;
  if (mbPerMin >= 1) return `${mbPerMin.toFixed(1)} MB/min`;
  return `${Math.round(mbPerMin * 1000)} KB/min`;
};

/** Expandable detail panel content. */
export function detailPanel(state, hasError, indCache) {
  const individuals = Object.values(state.byIndividual || {});
  const transferBytes = state.transferBytes || {};
  const totalTransfer = Object.values(transferBytes).reduce((s, v) => s + v, 0);
  return html`
    <div class="floating-bar__detail">
      ${hasError && state.lastError
        ? html`<div class="floating-bar__detail-row floating-bar__detail-row--error">
            ${state.lastError}
          </div>`
        : html``}
      <div class="floating-bar__detail-row">
        <span>Traits:</span>
        <span>${state.done} done · ${state.errors} failed · ${state.pending} pending</span>
      </div>
      ${state.rate > 0 || state.transferRate > 0
        ? html`<div class="floating-bar__detail-row">
            <span>Throughput:</span>
            <span
              >${state.rate > 0 ? `${fmtN(Math.round(state.rate))} variants/sec` : ''}${state.rate >
                0 && state.transferRate > 0
                ? ' · '
                : ''}${state.transferRate > 0 ? fmtRate(state.transferRate) : ''}</span
            >
          </div>`
        : html``}
      ${state.totalVariantsScored > 0
        ? html`<div class="floating-bar__detail-row">
            <span>Variants scored:</span> <span>${fmtN(state.totalVariantsScored)}</span>
          </div>`
        : html``}
      ${totalTransfer > 0
        ? html`<div class="floating-bar__detail-row">
            <span>Data scanned:</span> <span>${fmtBytes(totalTransfer)}</span>
          </div>`
        : html``}
      ${state.etaSeconds > 0
        ? html`<div class="floating-bar__detail-row">
            <span>ETA:</span> <span>${fmtT(state.etaSeconds)}</span>
          </div>`
        : html``}
      ${individuals.length > 1
        ? html`
            <div class="floating-bar__detail-heading">Per individual</div>
            ${individuals.map((ind) => {
              const meta = indCache[ind.id];
              const label = meta ? `${meta.emoji} ${meta.name}` : ind.id.slice(0, 8);
              const indBytes = transferBytes[ind.id];
              return html`<div class="floating-bar__detail-row">
                <span>${label}</span>
                <span
                  >${ind.done}/${ind.total}${ind.errors ? ` · ${ind.errors} err` : ''}${indBytes
                    ? ` · ${fmtBytes(indBytes)} scanned`
                    : ''}</span
                >
              </div>`;
            })}
          `
        : html``}
    </div>
  `;
}

/** Prev/next trait pager. */
export function pagerContent(prevHref, nextHref) {
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
