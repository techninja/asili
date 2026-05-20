/**
 * PGS comparison table — shows top PGS for a trait ranked by quality.
 * @module components/molecules/pgs-table
 */

import { html, define } from 'hybrids';

export default define({
  tag: 'pgs-table',
  pgsData: '',
  render: {
    value: ({ pgsData }) => {
      const entries = pgsData ? JSON.parse(pgsData) : [];
      if (entries.length === 0) {
        return html`<p class="pgs-table__empty">No PGS data available</p>`;
      }
      return html`
        <table class="pgs-table">
          <thead>
            <tr>
              <th>PGS</th>
              <th>R²</th>
              <th>z-score</th>
              <th>Coverage</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(
              (p) => html`
                <tr class="${p.isBest ? 'pgs-table__best' : ''}">
                  <td>${p.isBest ? html`<span class="pgs-table__star">★</span>` : html``}${p.id}</td>
                  <td>${((p.r2 || 0) * 100).toFixed(1)}%</td>
                  <td>
                    ${p.zScore !== null ? (p.zScore > 0 ? '+' : '') + p.zScore.toFixed(2) : '—'}
                  </td>
                  <td>${((p.coverage || 0) * 100).toFixed(1)}%</td>
                  <td>${(p.qualityScore || 0).toFixed(1)}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      `;
    },
    shadow: false,
  },
});
