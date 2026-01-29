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
    // Expect {chr1: {matched: 100, total: 500}, chr2: {...}, ...}
    this._coverage = value || {};
    this.render();
  }

  render() {
    const chromosomes = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                         '11', '12', '13', '14', '15', '16', '17', '18', '19', 
                         '20', '21', '22', 'X', 'Y'];
    
    const data = chromosomes.map(chr => {
      const stats = this._coverage[chr] || { matched: 0, total: 0 };
      const rate = stats.total > 0 ? (stats.matched / stats.total) * 100 : 0;
      return { chr, rate, matched: stats.matched, total: stats.total };
    });

    const maxRate = Math.max(...data.map(d => d.rate), 1);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; }
        .heatmap { display: flex; gap: 2px; padding: 10px; }
        .chr-bar { flex: 1; min-width: 12px; display: flex; flex-direction: column; align-items: center; }
        .bar { width: 100%; border-radius: 2px 2px 0 0; transition: all 0.2s; cursor: pointer; }
        .bar:hover { opacity: 0.7; transform: translateY(-2px); }
        .chr-label { font-size: 9px; color: #666; margin-top: 2px; }
        .legend { display: flex; justify-content: space-between; padding: 10px; font-size: 11px; color: #666; border-top: 1px solid #ddd; }
        .gradient { display: flex; height: 12px; width: 200px; border-radius: 3px; overflow: hidden; }
        .gradient-stop { flex: 1; }
        .tooltip { position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 5px 8px; border-radius: 3px; font-size: 11px; pointer-events: none; white-space: nowrap; z-index: 1000; }
      </style>
      <div class="heatmap">
        ${data.map(d => {
          const height = Math.max(20, (d.rate / maxRate) * 100);
          const color = this.getColor(d.rate);
          return `
            <div class="chr-bar" data-chr="${d.chr}" data-rate="${d.rate.toFixed(1)}" data-matched="${d.matched}" data-total="${d.total}">
              <div class="bar" style="height: ${height}px; background: ${color};"></div>
              <div class="chr-label">${d.chr}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="legend">
        <div>
          <div class="gradient">
            ${[0, 1, 2, 3, 4, 5].map(i => {
              const rate = (i / 5) * 100;
              return `<div class="gradient-stop" style="background: ${this.getColor(rate)};"></div>`;
            }).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>0%</span>
            <span>Match Rate</span>
            <span>100%</span>
          </div>
        </div>
        <div id="stats"></div>
      </div>
    `;

    // Add hover tooltips
    this.shadowRoot.querySelectorAll('.chr-bar').forEach(bar => {
      bar.addEventListener('mouseenter', (e) => {
        const chr = bar.dataset.chr;
        const rate = bar.dataset.rate;
        const matched = bar.dataset.matched;
        const total = bar.dataset.total;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = `Chr ${chr}: ${matched}/${total} (${rate}%)`;
        tooltip.style.left = `${e.clientX + 10}px`;
        tooltip.style.top = `${e.clientY - 30}px`;
        document.body.appendChild(tooltip);
        
        bar._tooltip = tooltip;
      });
      
      bar.addEventListener('mouseleave', () => {
        if (bar._tooltip) {
          bar._tooltip.remove();
          bar._tooltip = null;
        }
      });
    });

    // Update stats
    const totalMatched = data.reduce((sum, d) => sum + d.matched, 0);
    const totalVariants = data.reduce((sum, d) => sum + d.total, 0);
    const avgRate = totalVariants > 0 ? (totalMatched / totalVariants * 100).toFixed(1) : 0;
    
    const stats = this.shadowRoot.getElementById('stats');
    if (stats) {
      stats.textContent = `Overall: ${totalMatched.toLocaleString()}/${totalVariants.toLocaleString()} (${avgRate}%)`;
    }
  }

  getColor(rate) {
    // Red (low) -> Yellow (medium) -> Green (high)
    if (rate < 10) return '#dc3545';
    if (rate < 20) return '#fd7e14';
    if (rate < 30) return '#ffc107';
    if (rate < 40) return '#28a745';
    return '#20c997';
  }
}

customElements.define('chromosome-coverage', ChromosomeCoverage);
