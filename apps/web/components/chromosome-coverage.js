/**
 * Chromosome Coverage Heatmap
 * Shows variant match rate across chromosomes
 */

export class ChromosomeCoverage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._coverage = {};
  }

  connectedCallback() {
    this.render();
  }

  set coverage(value) {
    // Expect {"1": 100, "2": 50, ...} - just counts of matched variants per chromosome
    const newCoverage = value || {};
    if (JSON.stringify(this._coverage) === JSON.stringify(newCoverage)) return;
    console.log('ChromosomeCoverage: render triggered', Object.keys(newCoverage).length, 'chromosomes');
    this._coverage = newCoverage;
    this.render();
  }

  render() {
    console.log('ChromosomeCoverage: render() called');
    const chromosomes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                         '11', '12', '13', '14', '15', '16', '17', '18', '19', 
                         '20', '21', '22', 'X', 'Y'];
    
    const data = chromosomes.map(chr => {
      const count = this._coverage[chr] || 0;
      return { chr, count };
    });

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .chart { }
        svg { width: 100%; height: 110px; display: block; }
        .legend { padding: 10px; font-size: 11px; color: #666; border-top: 1px solid #ddd; text-align: center; }
      </style>
      <div class="chart">
        <svg viewBox="0 0 ${chromosomes.length * 20} 110">
          ${data.map((d, i) => {
            const height = Math.max(5, (d.count / maxCount) * 98);
            const y = 98 - height;
            const color = this.getColor(d.count, maxCount);
            return `
              <g>
                <rect class="bar" x="${i * 20 + 2}" y="${y}" width="16" height="${height}" fill="${color}" rx="2">
                  <title>Chr ${d.chr}: ${d.count.toLocaleString()} variants</title>
                </rect>
                <text x="${i * 20 + 10}" y="107" text-anchor="middle" font-size="10" font-weight="bold" fill="#333">${d.chr}</text>
              </g>
            `;
          }).join('')}
        </svg>
      </div>
      <div class="legend">Total: ${totalCount.toLocaleString()} matched variants across all chromosomes</div>
    `;
  }

  getColor(count, maxCount) {
    const ratio = count / maxCount;
    // Rainbow gradient: blue -> cyan -> green -> yellow -> orange -> red
    if (ratio < 0.17) return '#3b82f6'; // blue
    if (ratio < 0.33) return '#06b6d4'; // cyan
    if (ratio < 0.50) return '#10b981'; // green
    if (ratio < 0.67) return '#fbbf24'; // yellow
    if (ratio < 0.83) return '#f97316'; // orange
    return '#ef4444'; // red
  }
}

customElements.define('chromosome-coverage', ChromosomeCoverage);
