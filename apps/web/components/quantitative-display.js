/**
 * Quantitative Measurement Display
 * Shows actual measurement value for quantitative traits
 */

export class QuantitativeDisplay extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'unit', 'emoji', 'other-individuals', 'margin-of-error', 'phenotype-mean', 'phenotype-sd', 'reference-population'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  get value() {
    return parseFloat(this.getAttribute('value')) || 0;
  }

  get unit() {
    return this.getAttribute('unit') || '';
  }

  get emoji() {
    return this.getAttribute('emoji') || '👤';
  }

  get otherIndividuals() {
    const attr = this.getAttribute('other-individuals');
    return attr ? JSON.parse(attr) : [];
  }

  get marginOfError() {
    return parseFloat(this.getAttribute('margin-of-error')) || 0;
  }

  get phenotypeMean() {
    return parseFloat(this.getAttribute('phenotype-mean')) || null;
  }

  get phenotypeSd() {
    return parseFloat(this.getAttribute('phenotype-sd')) || null;
  }

  get referencePopulation() {
    return this.getAttribute('reference-population') || null;
  }

  render() {
    const value = this.value;
    const unit = this.unit;
    const others = this.otherIndividuals;
    const phenotypeMean = this.phenotypeMean;
    const phenotypeSd = this.phenotypeSd;
    const refPop = this.referencePopulation;
    
    // Calculate range for visualization
    const allValues = [value, ...others.map(o => o.value)].filter(v => v != null);
    
    // Define clinical/population reference ranges
    const referenceRanges = this.getReferenceRanges(unit, value);
    let minVal = referenceRanges.min;
    let maxVal = referenceRanges.max;
    
    // If we have phenotype mean/SD, use that to show population distribution
    let popMean = null;
    let popSd1Lower = null;
    let popSd1Upper = null;
    let popSd2Lower = null;
    let popSd2Upper = null;
    
    if (phenotypeMean !== null && phenotypeSd !== null && phenotypeSd > 0) {
      popMean = phenotypeMean;
      popSd1Lower = phenotypeMean - phenotypeSd;
      popSd1Upper = phenotypeMean + phenotypeSd;
      popSd2Lower = phenotypeMean - 2 * phenotypeSd;
      popSd2Upper = phenotypeMean + 2 * phenotypeSd;
      
      // Expand range to include ±3 SD
      minVal = Math.min(minVal, phenotypeMean - 3 * phenotypeSd);
      maxVal = Math.max(maxVal, phenotypeMean + 3 * phenotypeSd);
    }
    
    // Expand range if data exceeds reference ranges
    if (allValues.length > 0) {
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      if (dataMin < minVal) minVal = dataMin - (maxVal - minVal) * 0.1;
      if (dataMax > maxVal) maxVal = dataMax + (maxVal - minVal) * 0.1;
    }
    
    const range = maxVal - minVal;
    
    const getPosition = (val) => {
      return ((val - minVal) / range) * 360 + 20;
    };
    
    const userX = getPosition(value);
    
    // Calculate margin of error box for current user
    const margin = this.marginOfError;
    let userMarginBox = '';
    if (margin > 0) {
      const marginStart = getPosition(Math.max(minVal, value - margin));
      const marginEnd = getPosition(Math.min(maxVal, value + margin));
      userMarginBox = `
        <rect x="${marginStart}" y="55" width="${marginEnd - marginStart}" height="10" fill="#007acc" opacity="0.15" rx="2"/>
      `;
    }
    
    // Add reference zones with percentile bands
    const referenceZones = this.renderReferenceZones(unit, minVal, maxVal, getPosition);
    
    // Add population distribution markers if available
    let populationMarkers = '';
    if (popMean !== null) {
      const meanX = getPosition(popMean);
      const sd1LowerX = getPosition(popSd1Lower);
      const sd1UpperX = getPosition(popSd1Upper);
      const sd2LowerX = getPosition(popSd2Lower);
      const sd2UpperX = getPosition(popSd2Upper);
      
      populationMarkers = `
        <!-- Population mean (50th percentile) -->
        <line x1="${meanX}" y1="55" x2="${meanX}" y2="65" stroke="#666" stroke-width="2" stroke-dasharray="3,3"/>
        <text x="${meanX}" y="80" class="pop-label" text-anchor="middle">Pop Avg</text>
        
        <!-- ±1 SD (68% of population) -->
        <rect x="${sd1LowerX}" y="55" width="${sd1UpperX - sd1LowerX}" height="10" fill="#007acc" opacity="0.1"/>
        <line x1="${sd1LowerX}" y1="55" x2="${sd1LowerX}" y2="65" stroke="#007acc" stroke-width="1" opacity="0.5"/>
        <line x1="${sd1UpperX}" y1="55" x2="${sd1UpperX}" y2="65" stroke="#007acc" stroke-width="1" opacity="0.5"/>
        
        <!-- ±2 SD (95% of population) -->
        <line x1="${sd2LowerX}" y1="55" x2="${sd2LowerX}" y2="65" stroke="#999" stroke-width="1" opacity="0.3" stroke-dasharray="2,2"/>
        <line x1="${sd2UpperX}" y1="55" x2="${sd2UpperX}" y2="65" stroke="#999" stroke-width="1" opacity="0.3" stroke-dasharray="2,2"/>
      `;
    }
    
    // Group individuals by proximity (within 2% of range)
    const proximityThreshold = range * 0.02;
    const groups = [];
    
    [...others, { emoji: this.emoji, value, isUser: true, name: 'You' }].forEach(ind => {
      const pos = getPosition(ind.value);
      let foundGroup = groups.find(g => Math.abs(g.position - pos) < proximityThreshold);
      if (!foundGroup) {
        foundGroup = { position: pos, individuals: [] };
        groups.push(foundGroup);
      }
      foundGroup.individuals.push({ ...ind, position: pos });
    });
    
    // Spread out overlapping emojis at bottom
    const emojiWidth = 20;
    const occupiedPositions = [];
    
    groups.forEach(group => {
      group.individuals.forEach(ind => {
        if (!ind.isUser) {
          let displayX = ind.position;
          
          // Check for overlaps and shift horizontally
          let attempts = 0;
          while (attempts < 50) {
            const overlap = occupiedPositions.find(pos => Math.abs(pos - displayX) < emojiWidth);
            if (!overlap) break;
            
            // Alternate left/right shifts
            displayX = ind.position + (attempts % 2 === 0 ? 1 : -1) * Math.ceil(attempts / 2) * emojiWidth;
            attempts++;
          }
          
          ind.displayX = Math.max(20, Math.min(380, displayX));
          occupiedPositions.push(ind.displayX);
        } else {
          ind.displayX = ind.position;
        }
      });
    });
    
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; height: 120px; position: relative; }
        svg { width: 100%; height: 100%; overflow: visible; }
        .scale-line { stroke: #ddd; stroke-width: 2; }
        .user-marker { fill: #007acc; }
        .user-line { stroke: #007acc; stroke-width: 2; }
        .other-marker { fill: #999; }
        .other-line { stroke: #999; stroke-width: 1; }
        .individual-group:hover .other-line { stroke-width: 2; stroke: #666; }
        .label { font-size: 11px; fill: #666; user-select: none; }
        .user-label { font-size: 16px; font-weight: bold; fill: #007acc; user-select: none; }
        .other-label { font-size: 14px; fill: #666; user-select: none; }
        .value-text { font-size: 20px; font-weight: bold; text-anchor: middle; user-select: none; fill: #007acc; }
        .individual-group { cursor: pointer; transition: opacity 0.2s; }
        .individual-group:hover { opacity: 1 !important; }
        .individual-group:hover .user-marker,
        .individual-group:hover .other-marker { filter: drop-shadow(0 0 3px rgba(0,0,0,0.3)); }
        :host(.hovering) .individual-group:not(:hover) { opacity: 0.3; }
        .tooltip { position: absolute; background: rgba(0,0,0,0.9); color: white; padding: 6px 10px; border-radius: 4px; font-size: 12px; pointer-events: none; white-space: nowrap; z-index: 1000; display: none; }
        .tooltip.show { display: block; }
        .zone-label { font-size: 9px; fill: #666; user-select: none; opacity: 0.7; }
        .pop-label { font-size: 8px; fill: #007acc; user-select: none; font-weight: 600; }
      </style>
      <div class="tooltip" id="tooltip"></div>
      <svg viewBox="0 0 400 120" preserveAspectRay="xMidYMid meet">
        <!-- Reference zones (if applicable) -->
        ${referenceZones}
        
        <!-- Population distribution markers -->
        ${populationMarkers}
        
        <!-- Scale line -->
        <line x1="20" y1="60" x2="380" y2="60" class="scale-line"/>
        
        <!-- Min/Max labels -->
        <text x="20" y="75" class="label" text-anchor="start">${minVal.toFixed(1)}</text>
        <text x="380" y="75" class="label" text-anchor="end">${maxVal.toFixed(1)}</text>
        
        <!-- Individuals (grouped by proximity) -->
        ${groups.map((group, groupIdx) => {
          return group.individuals.map((ind) => {
            const dataX = ind.position;
            const displayX = ind.displayX;
            const isUser = ind.isUser;
            const indMargin = ind.marginOfError || 0;
            let marginBox = '';
            if (indMargin > 0) {
              const mStart = getPosition(Math.max(minVal, ind.value - indMargin));
              const mEnd = getPosition(Math.min(maxVal, ind.value + indMargin));
              marginBox = `<rect x="${mStart}" y="55" width="${mEnd - mStart}" height="10" fill="${isUser ? '#007acc' : '#999'}" opacity="0.15" rx="2"/>`;
            }
            return `
              <g class="individual-group" data-name="${ind.name || ind.emoji}" data-value="${ind.value.toFixed(2)}" data-unit="${unit}">
                ${marginBox}
                <line x1="${displayX}" y1="${isUser ? 30 : 105}" x2="${dataX}" y2="60" class="${isUser ? 'user-line' : 'other-line'}"/>
                <circle cx="${dataX}" cy="60" r="${isUser ? 6 : 4}" class="${isUser ? 'user-marker' : 'other-marker'}" opacity="${isUser ? 1 : 0.6}"/>
                <text x="${displayX}" y="${isUser ? 25 : 105}" class="${isUser ? 'user-label' : 'other-label'}" text-anchor="middle">${ind.emoji}</text>
              </g>
            `;
          }).join('');
        }).join('')}
        
        <!-- Value display -->
        <text x="200" y="15" class="value-text">${value.toFixed(1)} ${unit}</text>
      </svg>
    `;
    
    // Add hover interactions
    const tooltip = this.shadowRoot.getElementById('tooltip');
    const individualGroups = this.shadowRoot.querySelectorAll('.individual-group');
    
    individualGroups.forEach(group => {
      group.addEventListener('mouseenter', (e) => {
        this.classList.add('hovering');
        const name = group.dataset.name;
        const val = group.dataset.value;
        const unit = group.dataset.unit;
        tooltip.textContent = `${name}: ${val} ${unit}`;
        tooltip.classList.add('show');
      });
      
      group.addEventListener('mousemove', (e) => {
        tooltip.style.left = (e.clientX - this.getBoundingClientRect().left + 10) + 'px';
        tooltip.style.top = (e.clientY - this.getBoundingClientRect().top - 30) + 'px';
      });
      
      group.addEventListener('mouseleave', () => {
        this.classList.remove('hovering');
        tooltip.classList.remove('show');
      });
    });
  }

  getReferenceRanges(unit, value) {
    // Define clinical/population reference ranges for common measurements
    const ranges = {
      'BMI': { min: 16, max: 40 },
      'kg': { min: 40, max: 120 },  // Body weight
      'cm': { min: 140, max: 200 }, // Height
      'mmHg': value > 50 ? { min: 90, max: 180 } : { min: 60, max: 110 }, // BP
      'mg/dL': { min: 100, max: 300 }, // Cholesterol/glucose
      'years': { min: 0, max: 100 },
      '%': { min: 0, max: 100 },
      'score': { min: 0, max: 10 },
      'ratio': { min: 0.5, max: 1.5 },
      'kcal/day': { min: 1000, max: 3000 },
      'g/dL': { min: 10, max: 20 },
      'thousand/μL': { min: 0, max: 15 },
      'million/μL': { min: 3, max: 7 }
    };

    if (ranges[unit]) {
      return ranges[unit];
    }

    // Default: use data range with padding
    const padding = Math.abs(value * 0.3) || 10;
    return {
      min: value - padding,
      max: value + padding
    };
  }

  renderReferenceZones(unit, minVal, maxVal, getPosition) {
    const zones = [];

    if (unit === 'BMI') {
      // WHO BMI categories
      const underweight = getPosition(18.5);
      const normal = getPosition(25);
      const overweight = getPosition(30);
      const obese = getPosition(35);
      
      zones.push(`
        <rect x="20" y="55" width="${underweight - 20}" height="10" fill="#ffc107" opacity="0.15"/>
        <text x="${(20 + underweight) / 2}" y="52" class="zone-label" text-anchor="middle">Underweight</text>
        
        <rect x="${underweight}" y="55" width="${normal - underweight}" height="10" fill="#28a745" opacity="0.2"/>
        <text x="${(underweight + normal) / 2}" y="52" class="zone-label" text-anchor="middle">Normal</text>
        
        <rect x="${normal}" y="55" width="${overweight - normal}" height="10" fill="#ffc107" opacity="0.2"/>
        <text x="${(normal + overweight) / 2}" y="52" class="zone-label" text-anchor="middle">Overweight</text>
        
        <rect x="${overweight}" y="55" width="${Math.min(obese, 380) - overweight}" height="10" fill="#dc3545" opacity="0.2"/>
        <text x="${(overweight + Math.min(obese, 380)) / 2}" y="52" class="zone-label" text-anchor="middle">Obese</text>
      `);
    } else if (unit === 'mmHg' && maxVal > 100) {
      // Systolic blood pressure
      const normal = getPosition(120);
      const elevated = getPosition(130);
      const stage1 = getPosition(140);
      const stage2 = getPosition(180);
      
      zones.push(`
        <rect x="20" y="55" width="${normal - 20}" height="10" fill="#28a745" opacity="0.2"/>
        <text x="${(20 + normal) / 2}" y="52" class="zone-label" text-anchor="middle">Normal</text>
        
        <rect x="${normal}" y="55" width="${elevated - normal}" height="10" fill="#ffc107" opacity="0.15"/>
        <text x="${(normal + elevated) / 2}" y="52" class="zone-label" text-anchor="middle">Elevated</text>
        
        <rect x="${elevated}" y="55" width="${stage1 - elevated}" height="10" fill="#fd7e14" opacity="0.2"/>
        <text x="${(elevated + stage1) / 2}" y="52" class="zone-label" text-anchor="middle">Stage 1</text>
        
        <rect x="${stage1}" y="55" width="${Math.min(stage2, 380) - stage1}" height="10" fill="#dc3545" opacity="0.2"/>
        <text x="${(stage1 + Math.min(stage2, 380)) / 2}" y="52" class="zone-label" text-anchor="middle">Stage 2</text>
      `);
    } else if (unit === 'mg/dL') {
      // Total cholesterol
      const desirable = getPosition(200);
      const borderline = getPosition(240);
      
      zones.push(`
        <rect x="20" y="55" width="${desirable - 20}" height="10" fill="#28a745" opacity="0.2"/>
        <text x="${(20 + desirable) / 2}" y="52" class="zone-label" text-anchor="middle">Desirable</text>
        
        <rect x="${desirable}" y="55" width="${borderline - desirable}" height="10" fill="#ffc107" opacity="0.2"/>
        <text x="${(desirable + borderline) / 2}" y="52" class="zone-label" text-anchor="middle">Borderline</text>
        
        <rect x="${borderline}" y="55" width="${380 - borderline}" height="10" fill="#dc3545" opacity="0.2"/>
        <text x="${(borderline + 380) / 2}" y="52" class="zone-label" text-anchor="middle">High</text>
      `);
    }

    return zones.join('');
  }
}

customElements.define('quantitative-display', QuantitativeDisplay);
