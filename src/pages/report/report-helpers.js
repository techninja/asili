/**
 * Report helpers — trait table renderer.
 * @module pages/report/report-helpers
 */

import { html } from 'hybrids';
import { formatTraitValue } from '/packages/core/src/formatter.js';
import { results } from '#pages/beta/results-store.js';

/** @param {Array<object>} traits */
export function traitTable(traits) {
  return html`
    <table class="report__table">
      <thead>
        <tr>
          <th>Trait</th>
          <th>Percentile</th>
          <th>Value</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${traits.map((t) => {
          const r = results[t.trait_id];
          const fmt =
            r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
          return html`<tr>
            <td>${t.emoji || '🧬'} ${t.name}</td>
            <td>${Math.round(r?.percentile || 0)}th</td>
            <td>${fmt?.display || '—'}</td>
            <td><confidence-badge level="${r?.confidence || 'none'}"></confidence-badge></td>
          </tr>`;
        })}
      </tbody>
    </table>
  `;
}
