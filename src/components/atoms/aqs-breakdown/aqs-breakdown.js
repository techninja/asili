/**
 * AQS breakdown — Asili Quality Score visualization with speedometer
 * and component bar breakdown.
 * @module components/atoms/aqs-breakdown
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#atoms/speedometer/speedometer.js';

const R2_DEFAULT = 0.05;
const MIN_VARIANTS = 8;

export default define({
  tag: 'aqs-breakdown',
  data: '',
  render: {
    value: ({ data }) => {
      if (!data) return html``;
      const d = JSON.parse(data);
      const bars = computeBars(d);
      const total = Math.round(bars.reduce((s, b) => s + b.score, 0) * 10) / 10;
      return html`
        <div class="aqs">
          <speed-meter value="${total}" label="/ 100"></speed-meter>
          <div class="aqs__bars">
            ${bars.map(
              (b) => html`
                <div class="aqs__row">
                  <span class="aqs__label">${b.label}</span>
                  <div class="aqs__bar">
                    <div
                      class="aqs__fill"
                      style="${{ width: `${(b.score / b.max) * 100}%` }}"
                    ></div>
                  </div>
                  <span class="aqs__val">${b.score.toFixed(1)}</span>
                </div>
              `,
            )}
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} d */
function computeBars(d) {
  const coverage = d.total > 0 ? Math.min(d.matched / d.total, 1) : 0;
  const r2 = d.r2 || R2_DEFAULT;
  const hasR2 = d.r2 && d.r2 > R2_DEFAULT;
  const gRatio = d.matched > 0 ? d.genotyped / d.matched : 0;
  let cp = 1.0;
  if (coverage < 0.05) cp = (coverage / 0.05) ** 2;
  else if (coverage < 0.2) cp = Math.sqrt(coverage / 0.2);
  const ratio = Math.max(d.matched / MIN_VARIANTS, 1);
  let signal = 0;
  if (d.z !== null && d.z !== undefined && !isNaN(d.z)) {
    const az = Math.abs(d.z);
    signal = az > 5 ? 0 : Math.min(az / 3, 1) * 10;
  }
  return [
    { label: 'R² accuracy', score: r2 * 35 * cp, max: 35 },
    { label: 'Validation', score: hasR2 ? Math.min(r2 / 0.44, 1) * 15 : 0, max: 15 },
    { label: 'Reliability', score: gRatio * coverage * 15, max: 15 },
    { label: 'Coverage', score: coverage * 10, max: 10 },
    { label: 'Sample size', score: Math.min(Math.log10(ratio) / 3.1, 1) * 10, max: 10 },
    { label: 'Normalization', score: d.hasNorm ? 5 : 2.5, max: 5 },
    { label: 'Signal', score: signal, max: 10 },
  ];
}
