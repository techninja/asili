import { useTraitStore } from '../lib/trait-store.js';
import { useAppStore } from '../lib/store.js';
import './chromosome-coverage.js';

export class PGSBreakdown extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.traitId = null;
    this.pgsId = null;
    this.unsubscribe = null;
    this.chart = null;
  }

  static get observedAttributes() {
    return ['trait-id', 'pgs-id'];
  }

  attributeChangedCallback() {
    this.traitId = this.getAttribute('trait-id');
    this.pgsId = this.getAttribute('pgs-id');
    this.updateDisplay();
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.subscribeToTraitStore();
    this.updateDisplay();
  }

  disconnectedCallback() {
    this.unsubscribe?.();
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  setupEventListeners() {
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.closest('.back-btn')) {
        this.goBack();
      }
      if (e.target.closest('.nav-btn')) {
        const direction = e.target.dataset.direction;
        this.navigate(direction === 'next' ? 1 : -1);
      }
    });
  }

  subscribeToTraitStore() {
    let previousState = null;
    this.unsubscribe = useTraitStore.subscribe(() => {
      if (!this.traitId) return;
      const currentState = useTraitStore.getState().getTraitState(this.traitId);
      // Only update if THIS trait's state changed
      if (JSON.stringify(currentState) !== JSON.stringify(previousState)) {
        previousState = currentState;
        this.updateDisplay();
      }
    });
  }

  updateDisplay() {
    if (!this.traitId || !this.pgsId) return;
    
    const content = this.shadowRoot?.querySelector('.content');
    if (!content) return;
    
    const state = useTraitStore.getState().getTraitState(this.traitId);
    if (!state.cached?.pgsDetails?.[this.pgsId]) return;
    
    const appState = useAppStore.getState();
    const allIndividuals = appState.individuals || [];
    
    const pgsData = state.cached.pgsDetails[this.pgsId];
    const pgsBreakdown = state.cached.pgsBreakdown[this.pgsId];
    const navigation = state.pgsNavigation;
    const score = pgsBreakdown.positiveSum + pgsBreakdown.negativeSum;
    const gridCols = `12em repeat(${allIndividuals.length}, auto) auto auto auto`;
    
    content.innerHTML = `
      <style>
        .table-header { grid-template-columns: 8em repeat(${allIndividuals.length}, auto) auto auto auto; }
        .table-row { grid-template-columns: 12em repeat(${allIndividuals.length}, auto) auto auto auto; }
      </style>
      <div class="header">
        <button class="back-btn">← Back</button>
        <h4 title="PGS Catalog: ${pgsData.metadata?.name || this.pgsId}" style="max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0;">
          <a href="https://www.pgscatalog.org/score/${this.pgsId}" target="_blank" style="color: inherit; text-decoration: none;">${this.pgsId}</a>
        </h4>
        <div class="nav-buttons">
          <button class="nav-btn" data-direction="prev" ${navigation?.currentIndex === 0 ? 'disabled' : ''}>↑</button>
          <button class="nav-btn" data-direction="next" ${navigation?.currentIndex === navigation?.pgsIds.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </div>
      
      <div class="pgs-info">
        <div class="score-and-chart">
          <div class="score">${this.formatScore(score)}</div>
          <div class="chart-container">
            <svg class="pie-chart" width="60" height="60" viewBox="0 0 60 60">
              <circle class="pie-bg" cx="30" cy="30" r="25" fill="#f0f0f0" stroke="none"/>
              <circle class="pie-matched" cx="30" cy="30" r="25" fill="none" stroke="#007acc" stroke-width="6" 
                      stroke-dasharray="${(pgsBreakdown.positive + pgsBreakdown.negative) / (pgsData.metadata?.variants_number || pgsBreakdown.total) * 157.08} 157.08" 
                      stroke-dashoffset="0" transform="rotate(-90 30 30)" 
                      title="${pgsBreakdown.positive + pgsBreakdown.negative} of ${pgsData.metadata?.variants_number || pgsBreakdown.total} variants matched">
                <animate attributeName="stroke-dasharray" 
                         from="0 157.08" 
                         to="${(pgsBreakdown.positive + pgsBreakdown.negative) / (pgsData.metadata?.variants_number || pgsBreakdown.total) * 157.08} 157.08" 
                         dur="1s" 
                         fill="freeze"/>
              </circle>
              <text x="30" y="35" text-anchor="middle" class="pie-percent">${(((pgsBreakdown.positive + pgsBreakdown.negative) / (pgsData.metadata?.variants_number || pgsBreakdown.total)) * 100).toFixed(0)}%</text>
            </svg>
            <div class="chart-label">Score Fit</div>
          </div>
        </div>
        <div class="variants">${pgsBreakdown.positive + pgsBreakdown.negative} of ${pgsData.metadata?.variants_number || pgsBreakdown.total} variants matched (${(((pgsBreakdown.positive + pgsBreakdown.negative) / (pgsData.metadata?.variants_number || pgsBreakdown.total)) * 100).toFixed(1)}%)</div>
      </div>
      
      <div class="calculation-summary">
        <div>• ${pgsBreakdown.positive} variants increase risk (+${pgsBreakdown.positiveSum.toFixed(4)})</div>
        <div>• ${pgsBreakdown.negative} variants decrease risk (${pgsBreakdown.negativeSum.toFixed(4)})</div>
        <div><strong>Raw Score: ${score >= 0 ? '+' : ''}${score.toFixed(4)}</strong></div>
        ${pgsData.zScore !== null && pgsData.zScore !== undefined ? (() => {
          const traitType = state.cached.trait_type || 'disease_risk';
          const unit = state.cached.unit || null;
          
          return `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
            <div><strong>PGS Information:</strong></div>
            <div>• ID: <a href="https://www.pgscatalog.org/score/${this.pgsId}" target="_blank" style="color: #007acc;">${this.pgsId}</a></div>
            ${pgsData.metadata?.name ? `<div>• Name: ${pgsData.metadata.name}</div>` : ''}
            ${pgsData.metadata?.variants_number ? `<div>• Total variants: ${pgsData.metadata.variants_number.toLocaleString()}</div>` : ''}
            ${pgsData.performanceMetric ? `<div>• Performance (R²): ${(pgsData.performanceMetric * 100).toFixed(1)}%</div>` : ''}
            ${traitType === 'quantitative' && unit && pgsData.value !== null && pgsData.value !== undefined ? `
            <div style="margin-top: 8px;"><strong>Quantitative Value:</strong></div>
            <div>• Predicted value: ${pgsData.value.toFixed(2)} ${unit}</div>
            <div>• Z-score: ${pgsData.zScore >= 0 ? '+' : ''}${pgsData.zScore.toFixed(3)}σ</div>
            <div>• Percentile: ${this.zScoreToPercentile(pgsData.zScore)}${this.getOrdinalSuffix(this.zScoreToPercentile(pgsData.zScore))}</div>
            ${state.cached.phenotype_mean && state.cached.phenotype_sd ? `
            <div style="margin-top: 8px;"><strong>Population Context:</strong></div>
            <div>• Population mean: ${state.cached.phenotype_mean} ${unit}</div>
            <div>• Population std dev: ${state.cached.phenotype_sd} ${unit}</div>
            <div>• Reference: ${state.cached.reference_population || 'General population'}</div>
            ` : ''}
            ` : `
            <div style="margin-top: 8px;"><strong>Genetic Risk Score:</strong></div>
            <div>• Raw score: ${score >= 0 ? '+' : ''}${score.toFixed(4)}</div>
            <div>• Z-score: ${pgsData.zScore >= 0 ? '+' : ''}${pgsData.zScore.toFixed(3)}σ</div>
            <div>• Percentile: ${this.zScoreToPercentile(pgsData.zScore)}${this.getOrdinalSuffix(this.zScoreToPercentile(pgsData.zScore))}</div>
            <div style="margin-top: 8px;"><strong>Normalization:</strong></div>
            <div>• Population mean: ${pgsData.normMean !== undefined && pgsData.normMean !== null ? pgsData.normMean.toFixed(4) : (pgsData.zScore && score ? (score - pgsData.zScore).toFixed(4) : 'N/A')}</div>
            <div>• Population std dev: ${pgsData.normSd !== undefined && pgsData.normSd !== null ? pgsData.normSd.toFixed(4) : (pgsData.zScore && score && pgsData.normMean !== undefined ? ((score - pgsData.normMean) / pgsData.zScore).toFixed(4) : 'N/A')}</div>
            ${pgsData.normMean !== undefined && pgsData.normSd !== undefined ? `<div>• Formula: (${score.toFixed(4)} - ${pgsData.normMean.toFixed(4)}) / ${pgsData.normSd.toFixed(4)} = ${pgsData.zScore.toFixed(3)}</div>` : (pgsData.zScore && score ? `<div>• Formula: (${score.toFixed(4)} - ${(score - pgsData.zScore).toFixed(4)}) / 1.0000 = ${pgsData.zScore.toFixed(3)} (derived)</div>` : '')}
            `}
          </div>
          `;
        })() : ''}
      </div>
      
      <div class="score-distribution">
        <h5>Effect Weight Distribution</h5>
        <canvas id="distributionChart-${this.pgsId}" width="300" height="150"></canvas>
      </div>
      
      <div class="variant-list">
        <h5>Top Contributing Variants</h5>
        <div class="variant-table">
          <div class="table-header">
            <span>Variant</span>
            ${allIndividuals.map(ind => `<span title="${ind.name}'s DNA">${ind.emoji}</span>`).join('')}
            <span>🎯</span>
            <span>Weight</span>
            <span>Count</span>
          </div>
          <div class="table-body">
          ${(() => {
            const topVariants = (pgsBreakdown.topVariants || []).slice(0, 20);
            let cumulative = 0;
            const waterfall = topVariants.map(v => {
              const genotype = v.userGenotype || 'N/A';
              const effectAlleleCount = genotype === 'N/A' ? 0 : genotype.split('').filter(allele => allele === v.effect_allele).length;
              const contribution = v.effect_weight * effectAlleleCount;
              const start = cumulative;
              cumulative += contribution;
              return { ...v, start, end: cumulative, contribution, genotype, effectAlleleCount };
            });
            
            const maxAbs = Math.max(...waterfall.map(v => Math.abs(v.end)), 0.01);
            const centerPercent = 50;
            
            return waterfall.map(variant => {
              const variantId = variant.rsid || 'Unknown';
              let displayId, linkUrl, linkTitle;
              if (variantId.startsWith('rs')) {
                displayId = variantId;
                linkUrl = `https://www.ncbi.nlm.nih.gov/snp/${variantId}`;
                linkTitle = `See more about ${variantId} on NCBI dbSNP`;
              } else if (variantId.includes(':')) {
                const parts = variantId.split(':');
                displayId = parts.length >= 3 ? `chr${parts[0]}:${parts[1]}` : variantId;
                const pos = parseInt(parts[1]);
                const start = Math.max(1, pos - 5000);
                const end = pos + 5000;
                linkUrl = `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg19&position=chr${parts[0]}:${start}-${end}`;
                linkTitle = `See more about ${displayId} on UCSC Genome Browser`;
              } else {
                displayId = variantId;
                linkUrl = null;
                linkTitle = null;
              }
              
              const barStartPercent = centerPercent + (Math.min(variant.start, variant.end) / maxAbs) * 40;
              const barWidthPercent = (Math.abs(variant.contribution) / maxAbs) * 40;
              const barColor = variant.contribution >= 0 ? 'rgba(220, 53, 69, 0.3)' : 'rgba(21, 87, 36, 0.3)';
              
              return `
              <div class="table-row">
                <div class="waterfall-bar" style="left: ${barStartPercent}%; width: ${barWidthPercent}%; background: ${barColor};"></div>
                <span class="variant-id" title="Variant: ${displayId}">${linkUrl ? `<a href="${linkUrl}" target="_blank" title="${linkTitle}">${displayId}</a>` : displayId}</span>
                ${allIndividuals.map(ind => {
                  const geno = ind.id === appState.selectedIndividual ? variant.genotype : (variant.otherGenotypes?.[ind.id]?.genotype || '—');
                  return `<span class="genotype" title="${ind.name} has ${geno} at ${displayId}">${geno}</span>`;
                }).join('')}
                <span class="effect-allele" title="Effect allele: ${variant.effect_allele}">${variant.effect_allele}</span>
                <span class="weight ${variant.effect_weight >= 0 ? 'positive' : 'negative'}" title="Effect weight: ${variant.effect_weight >= 0 ? '+' : ''}${variant.effect_weight.toFixed(6)}">${variant.effect_weight >= 0 ? '+' : ''}${variant.effect_weight.toFixed(6)}</span>
                <span class="contribution" title="${variant.effectAlleleCount === 2 ? 'Homozygous (e.g. TT, CC) = 2× weight' : variant.effectAlleleCount === 1 ? 'Heterozygous (e.g. AT, CG) = 1× weight' : 'No effect alleles = 0× weight'}">×${variant.effectAlleleCount}</span>
              </div>
            `}).join('');
          })()}
          </div>
        </div>
      </div>
      
      <div class="chromosome-section">
        <h5>Chromosome Coverage</h5>
        <chromosome-coverage></chromosome-coverage>
      </div>
    `;
    
    // Set component data after DOM update
    setTimeout(() => {
      this.createChart(pgsData);
      const coverage = this.shadowRoot.querySelector('chromosome-coverage');
      if (coverage) {
        const chromosomeCoverage = pgsBreakdown.chromosomeCoverage || {};
        coverage.coverage = chromosomeCoverage;
      }
    }, 0);
  }

  calculateCoverage(variants) {
    const coverage = {};
    for (const v of variants) {
      const chr = v.chromosome || this.extractChr(v.rsid);
      if (!chr) continue;
      if (!coverage[chr]) coverage[chr] = { matched: 0, total: 0 };
      coverage[chr].matched++;
      coverage[chr].total++;
    }
    return coverage;
  }

  extractChr(rsid) {
    if (rsid?.includes(':')) {
      return rsid.split(':')[0].replace('chr', '');
    }
    return null;
  }

  goBack() {
    useTraitStore.getState().setSelectedPgs(this.traitId, null, null);
  }

  navigate(direction) {
    const state = useTraitStore.getState().getTraitState(this.traitId);
    const navigation = state.pgsNavigation;
    if (!navigation) return;
    
    const newIndex = navigation.currentIndex + direction;
    if (newIndex >= 0 && newIndex < navigation.pgsIds.length) {
      const newPgsId = navigation.pgsIds[newIndex];
      const newNavigation = { ...navigation, currentIndex: newIndex };
      useTraitStore.getState().setSelectedPgs(this.traitId, newPgsId, newNavigation);
    }
  }

  formatScore(score) {
    const abs = Math.abs(score);
    const sign = score >= 0 ? '+' : '';
    return abs >= 10 ? `${sign}${score.toFixed(2)}σ` : `${sign}${score.toFixed(3)}σ`;
  }

  zScoreToPercentile(zScore) {
    const erf = (x) => {
      const sign = x >= 0 ? 1 : -1;
      x = Math.abs(x);
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return sign * y;
    };
    return Math.round(0.5 * (1 + erf(zScore / Math.sqrt(2))) * 100);
  }

  getOrdinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  async createChart(pgsData) {
    const canvas = this.shadowRoot.getElementById(`distributionChart-${this.pgsId}`);
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const state = useTraitStore.getState().getTraitState(this.traitId);
    const pgsBreakdown = state.cached.pgsBreakdown[this.pgsId];
    const buckets = pgsBreakdown?.weightBuckets || [];
    
    if (buckets.length === 0) {
      canvas.style.display = 'none';
      return;
    }

    if (typeof Chart === 'undefined') {
      await window.loadChartJS?.();
    }
    if (typeof Chart === 'undefined') return;

    // Create linear x-axis labels based on bucket positions
    const labels = buckets.map((b, i) => {
      if (i === 0) return b.min.toFixed(4);
      if (i === buckets.length - 1) return b.max.toFixed(4);
      if (i === Math.floor(buckets.length / 2)) return ((b.min + b.max) / 2).toFixed(4);
      return '';
    });

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Variant Count',
          data: buckets.map(b => b.count),
          borderColor: '#007acc',
          backgroundColor: 'rgba(0, 122, 204, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          spanGaps: true
        }]
      },
      options: {
        responsive: false,
        scales: {
          y: { 
            beginAtZero: true, 
            title: { display: true, text: 'Variants' },
            type: 'logarithmic',
            min: 1
          },
          x: { 
            title: { display: true, text: 'Effect Weight' }, 
            ticks: { 
              maxRotation: 0,
              autoSkip: false
            } 
          }
        },
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const bucket = buckets[idx];
                return `${bucket.min.toFixed(4)} to ${bucket.max.toFixed(4)}`;
              },
              label: (context) => `${context.parsed.y} variants`
            }
          }
        }
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
        .back-btn { background: none; border: none; cursor: pointer; color: #007acc; }
        .header h4 { margin: 0; flex: 1; }
        .nav-buttons { display: flex; gap: 5px; }
        .nav-btn { background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; width: 24px; height: 24px; cursor: pointer; }
        .nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pgs-info { text-align: center; margin-bottom: 20px; }
        .score-and-chart { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .score { font-size: 1.5em; font-weight: bold; color: #007acc; flex: 1; text-align: center; }
        .chart-container { display: flex; flex-direction: column; align-items: center; }
        .pie-chart { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
        .pie-percent { font-size: 10px; font-weight: bold; fill: #333; }
        .chart-label { font-size: 10px; color: #666; margin-top: 2px; }
        .variants { font-size: 12px; color: #666; margin-top: 5px; }
        .calculation-summary { margin-bottom: 20px; font-size: 12px; line-height: 1.4; }
        .calculation-summary div { margin-bottom: 3px; }
        .score-distribution { margin: 15px 0; }
        .score-distribution h5 { margin: 0 0 10px 0; font-size: 12px; }
        .score-distribution canvas { max-width: 100%; height: 150px; }
        .variant-list { margin: 15px 0; }
        .variant-list h5 { margin: 0 0 10px 0; font-size: 14px; }
        .variant-table { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; max-height: 200px; display: flex; flex-direction: column; }
        .table-header { display: grid; background: #f5f5f5; padding: 8px; font-weight: bold; font-size: 15px; position: sticky; top: 0; z-index: 1; }
        .table-header span:first-child { padding-right: 8px; }
        .table-header span:not(:first-child) { text-align: center; justify-self: center; font-size: 15px; }
        .table-header span:nth-last-child(2), .table-header span:nth-last-child(1) { text-align: right; justify-self: end; }
        .table-body { overflow-y: auto; flex: 1; }
        .table-row { position: relative; display: grid; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; cursor: default; user-select: none; }
        .table-row:hover { background: #f0f8ff; }
        .waterfall-bar { position: absolute; top: 0; height: 100%; z-index: 0; border-radius: 2px; }
        .table-row > span { position: relative; z-index: 1; }
        .variant-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .variant-id a { color: #007acc; text-decoration: none; font-family: monospace; }
        .variant-id a:hover { text-decoration: underline; }
        .genotype { font-family: monospace; font-weight: bold; color: #2e7d32; text-align: center; }
        .effect-allele { font-family: monospace; color: #d32f2f; font-weight: bold; text-align: center; }
        .weight, .contribution { font-family: monospace; text-align: right; }
        .weight.positive { color: #721c24; }
        .weight.negative { color: #155724; }
        .chromosome-section { margin: 15px 0; }
        .chromosome-section h5 { margin: 0 0 10px 0; font-size: 14px; }
      </style>
      <div class="content"></div>
    `;
  }
}

customElements.define('pgs-breakdown', PGSBreakdown);
