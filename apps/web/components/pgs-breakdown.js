import { useTraitStore } from '../lib/trait-store.js';
import { useAppStore } from '../lib/store.js';

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
    const currentIndividual = appState.individuals.find(ind => ind.id === appState.selectedIndividual);
    const individualEmoji = currentIndividual?.emoji || '👤';
    const individualName = currentIndividual?.name || 'Individual';
    
    const pgsData = state.cached.pgsDetails[this.pgsId];
    const pgsBreakdown = state.cached.pgsBreakdown[this.pgsId];
    const navigation = state.pgsNavigation;
    const score = pgsBreakdown.positiveSum + pgsBreakdown.negativeSum;
    
    content.innerHTML = `
      <div class="header">
        <button class="back-btn">← Back</button>
        <h4 title="PGS Catalog: ${pgsData.metadata?.name || this.pgsId}" style="max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0;">
          <a href="https://www.pgscatalog.org/score/${this.pgsId}" target="_blank" style="color: inherit; text-decoration: none;">${pgsData.metadata?.name || this.pgsId}</a>
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
        <div>• Each variant contributes: weight × effect allele count</div>
        <div><strong>Net contribution: ${score >= 0 ? '+' : ''}${score.toFixed(4)}</strong></div>
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
            <span title="${individualName}'s DNA">${individualEmoji}</span>
            <span>Effect</span>
            <span>Weight</span>
            <span>Count</span>
          </div>
          ${(pgsData.topVariants || []).slice(0, 10).map(variant => {
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
            return `
            <div class="table-row">
              <span class="variant-id">${linkUrl ? `<a href="${linkUrl}" target="_blank" title="${linkTitle}">${displayId}</a>` : displayId}</span>
              <span class="genotype">${variant.userGenotype || 'N/A'}</span>
              <span class="effect-allele">${variant.effect_allele}</span>
              <span class="weight ${variant.effect_weight >= 0 ? 'positive' : 'negative'}">${variant.effect_weight >= 0 ? '+' : ''}${variant.effect_weight.toFixed(6)}</span>
              <span class="contribution" title="${(() => {
                const genotype = variant.userGenotype || 'N/A';
                const effectAlleleCount = genotype === 'N/A' ? 0 : genotype.split('').filter(allele => allele === variant.effect_allele).length;
                return effectAlleleCount === 2 ? 'Homozygous (e.g. TT, CC) = 2× weight' : effectAlleleCount === 1 ? 'Heterozygous (e.g. AT, CG) = 1× weight' : 'No effect alleles = 0× weight';
              })()}">×${(() => {
                const genotype = variant.userGenotype || 'N/A';
                return genotype === 'N/A' ? 0 : genotype.split('').filter(allele => allele === variant.effect_allele).length;
              })()}</span>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
    
    // Render chart after DOM update
    setTimeout(() => this.createChart(pgsData), 100);
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

  async createChart(pgsData) {
    const canvas = this.shadowRoot.getElementById(`distributionChart-${this.pgsId}`);
    if (!canvas) return;

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (typeof Chart === 'undefined') {
      await window.loadChartJS?.();
    }
    if (typeof Chart === 'undefined') return;

    const variants = pgsData.topVariants || [];
    const bins = [
      { label: '-1.0 to -0.1', min: -Infinity, max: -0.1, count: 0 },
      { label: '-0.1 to -0.05', min: -0.1, max: -0.05, count: 0 },
      { label: '-0.05 to -0.01', min: -0.05, max: -0.01, count: 0 },
      { label: '-0.01 to -0.001', min: -0.01, max: -0.001, count: 0 },
      { label: '-0.001 to 0', min: -0.001, max: 0, count: 0 },
      { label: '0 to 0.001', min: 0, max: 0.001, count: 0 },
      { label: '0.001 to 0.01', min: 0.001, max: 0.01, count: 0 },
      { label: '0.01 to 0.05', min: 0.01, max: 0.05, count: 0 },
      { label: '0.05 to 0.1', min: 0.05, max: 0.1, count: 0 },
      { label: '0.1 to 1.0+', min: 0.1, max: Infinity, count: 0 }
    ];

    variants.forEach(v => {
      const weight = v.effect_weight;
      const bin = bins.find(b => weight > b.min && weight <= b.max);
      if (bin) bin.count++;
    });

    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: bins.map(b => b.label),
        datasets: [{
          label: 'Variant Count',
          data: bins.map(b => b.count),
          backgroundColor: bins.map(b => b.label.startsWith('-') ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)')
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Number of Variants' } },
          x: { title: { display: true, text: 'Effect Weight Range' } }
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
        .score-distribution canvas { max-width: 100%; height: auto; }
        .variant-list { max-height: 300px; overflow-y: auto; }
        .variant-list h5 { margin: 0 0 10px 0; font-size: 14px; }
        .variant-table { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
        .table-header { display: grid; grid-template-columns: 1.2fr 0.6fr 0.8fr 1fr 0.8fr; background: #f5f5f5; padding: 8px; font-weight: bold; font-size: 11px; }
        .table-header span:nth-child(2), .table-header span:nth-child(3) { text-align: center; }
        .table-header span:nth-child(2) { font-size: 14px; }
        .table-header span:nth-child(4), .table-header span:nth-child(5) { text-align: right; }
        .table-row { display: grid; grid-template-columns: 1.2fr 0.6fr 0.8fr 1fr 0.8fr; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
        .variant-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .variant-id a { color: #007acc; text-decoration: none; font-family: monospace; }
        .variant-id a:hover { text-decoration: underline; }
        .genotype { font-family: monospace; font-weight: bold; color: #2e7d32; text-align: center; }
        .effect-allele { font-family: monospace; color: #d32f2f; font-weight: bold; text-align: center; }
        .weight, .contribution { font-family: monospace; text-align: right; }
        .weight.positive { color: #721c24; }
        .weight.negative { color: #155724; }
      </style>
      <div class="content"></div>
    `;
  }
}

customElements.define('pgs-breakdown', PGSBreakdown);
