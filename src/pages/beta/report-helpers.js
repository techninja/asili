/**
 * Report data helpers — stats computation and trait table renderer.
 * @module pages/beta/report-helpers
 */

import { html, router } from 'hybrids';
import { results } from './results-store.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';

/** @param {Array<object>} traits */
export function traitTable(traits) {
  return html`
    <table class="report-tab__table">
      <thead>
        <tr>
          <th>Trait</th>
          <th>Pctl</th>
          <th>Value</th>
          <th>Cov</th>
        </tr>
      </thead>
      <tbody>
        ${traits.map((t) => {
          const r = results[t.trait_id];
          const det = r?.bestPGS && r.pgsDetails?.[r.bestPGS];
          const fmt =
            r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
          const cov = det?.coverage ? Math.round(det.coverage * 100) : 0;
          const href = router.url(TraitDetailView, { traitId: t.trait_id });
          return html`<tr>
            <td>
              <a
                href="${href}"
                class="report-tab__trait-link"
                onclick="${() => sessionStorage.setItem('asili-source-tab', 'report')}"
                >${t.emoji || '🧬'} ${t.name}</a
              >
            </td>
            <td>${Math.round(r?.percentile || 0)}th</td>
            <td>${fmt?.display || '—'}</td>
            <td>${cov}%</td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}

/** @param {Array<object>} scored */
export function computeStats(scored) {
  let covSum = 0,
    aqsSum = 0,
    impCount = 0,
    highCov = 0,
    midCov = 0,
    lowCov = 0;
  for (const t of scored) {
    const r = results[t.trait_id];
    const det = r?.bestPGS && r.pgsDetails?.[r.bestPGS];
    const cov = det?.coverage || 0;
    covSum += cov;
    aqsSum += det?.qualityScore || 0;
    if (det?.imputedVariants > 0) impCount++;
    if (cov >= 0.8) highCov++;
    else if (cov >= 0.5) midCov++;
    else lowCov++;
  }
  const n = scored.length || 1;
  return {
    count: scored.length,
    avgCov: Math.round((covSum / n) * 100),
    avgAqs: Math.round(aqsSum / n),
    source: impCount > n / 2 ? 'Imputed' : 'Raw DNA',
    highCov,
    midCov,
    lowCov,
  };
}
