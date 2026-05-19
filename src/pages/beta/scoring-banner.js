/**
 * Scoring banner — global queue progress with dual bars, ETA, variants/sec, pause/resume.
 * @module pages/beta/scoring-banner
 */

import { html } from 'hybrids';
import {
  handlePause,
  handleResume,
  handleResumePermission,
  getQueueState,
} from './scoring-controller.js';
import { getImputedNeedingReupload } from '#utils/scoring-queue.js';

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
function openScoringScreen(host) {
  host.scoringScreen = true;
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/** @param {object} host */
export function scoringBanner(host) {
  if (host.scoringStatus === 'scoring') {
    void host.scoringTick;
    const state = getQueueState();
    const d = state.done + state.errors;
    const t = state.total || 1;
    const totalPct = ((d / t) * 100).toFixed(1);
    const chrPct =
      state.currentChrTotal > 0
        ? Math.round((state.currentChrDone / state.currentChrTotal) * 100)
        : 0;
    const vps = state.rate > 0 ? fmtN(Math.round(state.rate)) : '—';
    const indLabel = state.individualCount > 1 ? `${state.individualCount} individuals · ` : '';
    const trait = state.currentTraitName || '';

    return html`
      <div class="beta-view__scoring-panel">
        <div class="beta-view__scoring-bars">
          <div
            class="beta-view__scoring-bar"
            title="${totalPct}% · ${d}/${t} traits across all individuals"
          >
            <div class="beta-view__scoring-fill" style="${{ width: `${totalPct}%` }}"></div>
          </div>
          <div
            class="beta-view__scoring-bar beta-view__scoring-bar--chr"
            title="${chrPct}% complete for ${trait}"
          >
            <div class="beta-view__scoring-fill--chr" style="${{ width: `${chrPct}%` }}"></div>
          </div>
        </div>
        <p class="beta-view__scoring">
          ${indLabel}${trait}${state.currentChrTotal > 0
            ? html` chr ${state.currentChrDone}/${state.currentChrTotal}`
            : html``}
          ·
          ${d}/${t}${state.rate > 0 ? html` · ${vps}/s` : html``}${state.etaSeconds > 0
            ? html` · ~${fmtT(state.etaSeconds)}`
            : html``}
          <button class="btn btn-ghost btn-sm" onclick="${() => handlePause()}">⏸ Pause</button>
          <button class="btn btn-ghost btn-sm" onclick="${openScoringScreen}">🖥 Focus</button>
        </p>
      </div>
    `;
  }
  if (host.scoringStatus === 'paused') {
    const state = getQueueState();
    const d = state.done + state.errors;
    return html`
      <p class="beta-view__scoring">
        ⏸ Paused · ${d}/${state.total} traits scored
        <button class="btn btn-ghost btn-sm" onclick="${() => handleResume()}">▶ Resume</button>
      </p>
    `;
  }
  if (host.scoringStatus === 'init')
    return html`<p class="beta-view__scoring">Initializing DuckDB…</p>`;
  if (host.scoringStatus === 'done')
    return html`<p class="beta-view__scoring beta-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  if (host.scoringStatus === 'blocked') {
    const need = getImputedNeedingReupload().length;
    return html`<p class="beta-view__scoring">
      ⏸ ${need} imputed file${need !== 1 ? 's' : ''} needed to continue
      <button class="btn btn-ghost btn-sm" onclick="${handleResumePermission}">
        ▶ Select file${need !== 1 ? 's' : ''}
      </button>
    </p>`;
  }
  return html``;
}
