/**
 * Scoring banner — dual progress bars, ETA, variants/sec, pause.
 * @module pages/beta/scoring-banner
 */

import { html } from 'hybrids';
import {
  handleStopScoring,
  getScoringStartTime,
  getScoringVariants,
} from './scoring-controller.js';

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

/** @param {object} host */
export function scoringBanner(host) {
  if (host.scoringStatus === 'scoring') {
    void host.scoringTick;
    const d = host.scoringCurrent,
      t = host.scoringTotal || 1;
    const totalPct = Math.round((d / t) * 100);
    const chrPct =
      host.scoringChrTotal > 0 ? Math.round((host.scoringChrDone / host.scoringChrTotal) * 100) : 0;
    const sec = (Date.now() - getScoringStartTime()) / 1000;
    const rem = d > 0 ? Math.round((sec / d) * (t - d)) : 0;
    const vps = sec > 2 ? fmtN(Math.round(getScoringVariants() / sec)) : '—';
    return html`
      <div class="beta-view__scoring-panel">
        <div class="beta-view__scoring-bars">
          <div class="beta-view__scoring-bar" title="${totalPct}% complete for all traits">
            <div class="beta-view__scoring-fill" style="${{ width: `${totalPct}%` }}"></div>
          </div>
          <div
            class="beta-view__scoring-bar beta-view__scoring-bar--chr"
            title="${chrPct}% complete for ${host.scoringTrait}"
          >
            <div class="beta-view__scoring-fill--chr" style="${{ width: `${chrPct}%` }}"></div>
          </div>
        </div>
        <p class="beta-view__scoring">
          ${host.scoringTrait} · ${d}/${t}${d > 0 ? html` · ~${fmtT(rem)} · ${vps}/s` : html``}
          <button class="btn btn-ghost btn-sm" onclick="${handleStopScoring}">⏸ Pause</button>
        </p>
      </div>
    `;
  }
  if (host.scoringStatus === 'init')
    return html`<p class="beta-view__scoring">Initializing DuckDB…</p>`;
  if (host.scoringStatus === 'done')
    return html`<p class="beta-view__scoring beta-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  return html``;
}
