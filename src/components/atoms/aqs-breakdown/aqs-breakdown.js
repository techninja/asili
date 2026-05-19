/**
 * AQS breakdown — Asili Quality Score visualization with speedometer
 * and component bar breakdown. Rows are tappable to show explanations.
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
  activeRow: -1,
  render: {
    value: ({ data, activeRow }) => {
      if (!data) return html``;
      const d = JSON.parse(data);
      const bars = computeBars(d);
      const total = Math.round(bars.reduce((s, b) => s + b.score, 0) * 10) / 10;
      return html`
        <div class="aqs">
          <speed-meter value="${total}" label="/ 100"></speed-meter>
          <div class="aqs__bars">
            ${bars.map(
              (b, i) => html`
                <div
                  class="aqs__row ${activeRow === i ? 'aqs__row--active' : ''}"
                  onclick="${(host) => { host.activeRow = host.activeRow === i ? -1 : i; }}"
                >
                  <span class="aqs__label">${b.label}</span>
                  <div class="aqs__bar">
                    <div
                      class="aqs__fill"
                      style="${{ width: `${(b.score / b.max) * 100}%` }}"
                    ></div>
                  </div>
                  <span class="aqs__val">${b.score.toFixed(1)}</span>
                </div>
                ${activeRow === i
                  ? html`<div class="aqs__tooltip">${b.desc}</div>`
                  : html``}
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
    {
      label: 'R² accuracy',
      max: 35,
      score: r2 * 35 * cp,
      desc: 'How well this PGS predicts the trait in published studies. Higher R² means the score explains more of the trait variation in real populations.',
    },
    {
      label: 'Validation',
      max: 15,
      score: hasR2 ? Math.min(r2 / 0.44, 1) * 15 : 0,
      desc: 'Whether this PGS was independently tested in a separate cohort study. Validated scores are more trustworthy than unvalidated ones.',
    },
    {
      label: 'Reliability',
      max: 15,
      score: gRatio * coverage * 15,
      desc: 'How much of your score comes from directly genotyped variants vs. statistical estimates (imputation). Direct genotypes are more reliable per-variant.',
    },
    {
      label: 'Coverage',
      max: 10,
      score: coverage * 10,
      desc: `${Math.round(coverage * 100)}% of the variants this PGS needs were found in your DNA data. Higher coverage means a more complete picture.`,
    },
    {
      label: 'Sample size',
      max: 10,
      score: Math.min(Math.log10(ratio) / 3.1, 1) * 10,
      desc: `${d.matched.toLocaleString()} variants matched. More matched variants generally means a more stable, reliable score.`,
    },
    {
      label: 'Normalization',
      max: 5,
      score: d.hasNorm ? 5 : 2.5,
      desc: d.hasNorm
        ? 'Population statistics are available, allowing accurate percentile calculation.'
        : 'Using theoretical estimates for percentile calculation — less precise than empirical data.',
    },
    {
      label: 'Signal',
      max: 10,
      score: signal,
      desc: signal === 0 && d.z !== null && Math.abs(d.z) > 5
        ? 'Z-score exceeds 5σ — likely indicates incompatible statistics rather than genuine extreme risk. Score penalized to 0.'
        : 'How informative this result is for you specifically. Scores closer to average (z≈0) are less informative than those further out.',
    },
  ];
}
