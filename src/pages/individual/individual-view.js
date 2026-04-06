/**
 * Individual view — shows one individual's scoring status + trait grid.
 * Loads results from IndexedDB, starts scoring if needed.
 * @module pages/individual
 */

import { html, define, router } from 'hybrids';
import * as idb from '/packages/core/src/data-layer/idb.js';
// @ts-ignore
import '#organisms/trait-grid/trait-grid.js';
import { loadResults } from '#pages/beta/results-store.js';
import { initScoring, loadDNA, scoreAll, stopScoring, isScoring } from '#utils/scoring.js';
import { getTraitList } from '#utils/manifest.js';
import { setResult } from '#pages/beta/results-store.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';
import ReportView from '#pages/report/report-view.js';

export default define({
  tag: 'individual-view',
  [router.connect]: { url: '/individual/:id', stack: [TraitDetailView, ReportView] },
  id: '',
  individual: { value: /** @type {object|null} */ (null), connect: () => {} },
  resultCount: 0,
  scoringStatus: { value: '', connect: () => {} },
  scoringCurrent: { value: 0, connect: () => {} },
  scoringTotal: { value: 0, connect: () => {} },
  scoringTrait: { value: '', connect: () => {} },
  _init: {
    value: false,
    connect: (host, _key, invalidate) => {
      loadIndividual(host).then(invalidate);
    },
  },
  render: {
    value: (host) => {
      const ind = host.individual;
      const name = ind ? `${ind.emoji} ${ind.name}` : 'Loading…';
      return html`
        <div class="individual-view">
          <header class="individual-view__header">
            <a href="/beta" class="individual-view__back">← Individuals</a>
            <h1 class="individual-view__title">${name}</h1>
            ${ind
              ? html`<span class="individual-view__meta">
                  ${ind.variantCount?.toLocaleString()} variants
                </span>`
              : html``}
          </header>
          ${scoringBanner(host)}
          <div class="individual-view__actions">
            <a href="${router.url(ReportView)}" class="btn btn-ghost">📄 Report</a>
            ${host.scoringStatus === '' && host.resultCount === 0
              ? html`<button class="btn btn-primary" onclick="${startScore}">
                  ▶ Score traits
                </button>`
              : html``}
          </div>
          <trait-grid resultCount="${host.resultCount}"></trait-grid>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host */
function scoringBanner(host) {
  if (host.scoringStatus === 'init')
    return html`<p class="individual-view__scoring">Initializing DuckDB…</p>`;
  if (host.scoringStatus === 'scoring')
    return html`<p class="individual-view__scoring">
      Scoring: ${host.scoringTrait} (${host.scoringCurrent + 1}/${host.scoringTotal})
      <button class="btn btn-ghost btn-sm" onclick="${handleStop}">⏹ Stop</button>
    </p>`;
  if (host.scoringStatus === 'done')
    return html`<p class="individual-view__scoring individual-view__scoring--done">
      ✅ ${host.resultCount} traits scored
    </p>`;
  return html``;
}

/** @param {object} host */
async function loadIndividual(host) {
  if (!host.id) return;
  await idb.openDB();
  host.individual = await idb.get('individuals', host.id);
  host.resultCount = 0;
  const count = await loadResults(host.id);
  host.resultCount = count;
  if (count === 0) startScore(host);
}

/** @param {object} host */
async function startScore(host) {
  if (!host.id || isScoring()) return;
  const stored = await idb.get('variants', host.id);
  if (!stored?.variants) return;
  host.scoringStatus = 'init';
  try {
    await initScoring();
    await loadDNA(stored.variants);
    host.scoringStatus = 'scoring';
    const traits = await getTraitList();
    host.scoringTotal = traits.length;
    await scoreAll(traits, '/data', {
      onProgress: ({ current, total, traitName }) => {
        host.scoringCurrent = current;
        host.scoringTotal = total;
        host.scoringTrait = traitName;
      },
      onTraitScored: async ({ traitId, result }) => {
        await setResult(traitId, result);
        host.resultCount++;
      },
    });
    host.scoringStatus = 'done';
  } catch (err) {
    host.scoringStatus = 'error';
  }
}

/** @param {object} host */
async function handleStop(host) {
  await stopScoring();
  host.scoringStatus = host.resultCount > 0 ? 'done' : '';
}
