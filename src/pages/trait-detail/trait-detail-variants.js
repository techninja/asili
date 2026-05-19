/**
 * Top contributing variants — table with waterfall behind rows.
 * @module pages/trait-detail/trait-detail-variants
 */

import { html } from 'hybrids';

/** @param {object} r @param {string} [indEmoji] */
export function topVariantsSection(r, indEmoji) {
  const best = r.bestPGS && r.pgsDetails?.[r.bestPGS];
  const tv = best?.topVariants;
  if (!tv?.length) return html``;
  const em = indEmoji || '🧬';

  let cum = 0;
  const wf = tv.map((v) => {
    const start = cum;
    cum += v.contribution;
    return { ...v, start, end: cum };
  });
  const maxAbs = Math.max(...wf.map((v) => Math.max(Math.abs(v.start), Math.abs(v.end))), 0.01);

  return html`
    <section class="trait-detail__section trait-detail__variants">
      <h2 class="trait-detail__variants-title">
        <app-icon name="microscope"></app-icon> Top Variants
      </h2>
      <div class="trait-detail__variants-scroll">
        <div class="trait-detail__variants-body">
          <div class="trait-detail__var-wf-layer" innerHTML="${buildWaterfall(wf, maxAbs)}"></div>
          <table class="trait-detail__var-table">
            <thead>
              <tr>
                <th>Variant</th>
                <th title="Your genotype">${em}</th>
                <th title="Effect allele">Effect</th>
                <th title="Impact on your score">Impact</th>
              </tr>
            </thead>
            <tbody>
              ${wf.map((v) => variantRow(v))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/** @param {object} v */
function variantRow(v) {
  const vid = v.variantId || '';
  const parts = vid.split(':');
  const hasRs = vid.startsWith('rs');
  const display = hasRs ? vid : parts.length >= 3 ? `${parts[0]}:${parts[1]}` : vid;
  const link = hasRs
    ? `https://www.ncbi.nlm.nih.gov/snp/${vid}`
    : `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr${parts[0]}:${parts[1]}`;
  const geno = v.genotype || '—';
  const c = v.contribution;
  const impactCol = c >= 0 ? 'var(--color-danger)' : 'var(--color-success)';
  const tip = `Weight: ${v.effectWeight >= 0 ? '+' : ''}${v.effectWeight.toFixed(6)} × ${v.dosage.toFixed(2)} dosage${v.imputed ? ' (imputed)' : ''}`;
  return html`<tr>
    <td>
      <a href="${link}" target="_blank" rel="noopener" class="trait-detail__var-link">${display}</a>
    </td>
    <td class="trait-detail__var-geno">${geno}</td>
    <td>${v.effectAllele}</td>
    <td class="trait-detail__var-impact" style="${{ color: impactCol }}" title="${tip}">
      ${c >= 0 ? '+' : ''}${c.toFixed(4)}
    </td>
  </tr>`;
}

/** @param {Array} wf @param {number} maxAbs */
function buildWaterfall(wf, maxAbs) {
  const scale = 45 / maxAbs;
  let bars = `<div class="trait-detail__var-wf-zero"></div>`;
  for (const v of wf) {
    const s = 50 + v.start * scale,
      e = 50 + v.end * scale;
    const left = Math.min(s, e),
      w = Math.abs(e - s);
    const col = v.contribution >= 0 ? '#ef4444' : '#22c55e';
    bars += `<div class="trait-detail__var-wf-row"><div class="trait-detail__var-wf-bar" style="left:${left}%;width:${Math.max(w, 0.3)}%;background:${col}"></div></div>`;
  }
  return bars;
}
