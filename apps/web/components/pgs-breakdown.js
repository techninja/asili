import { Debug } from '@asili/debug';

export class PGSBreakdown extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    async createDistributionChart(variants, containerId) {
        Debug.log(2, 'PGSBreakdown', 'Creating distribution chart with', variants.length, 'variants');
        
        const canvas = document.getElementById(containerId);
        if (!canvas) {
            Debug.error('PGSBreakdown', 'Canvas element not found:', containerId);
            return;
        }
        
        await this.createDistributionChartOnCanvas(variants, canvas);
    }

    async createDistributionChartOnCanvas(distributionData, canvas) {
        Debug.log(2, 'PGSBreakdown', 'Creating distribution chart from cached data');
        
        if (!canvas) {
            Debug.error('PGSBreakdown', 'Canvas element is null');
            return;
        }
        
        // Ensure Chart.js is loaded
        if (typeof Chart === 'undefined') {
            Debug.log(2, 'PGSBreakdown', 'Loading Chart.js...');
            await window.loadChartJS();
        }
        
        if (typeof Chart === 'undefined') {
            Debug.error('PGSBreakdown', 'Chart.js failed to load');
            return;
        }
        
        // Use cached distribution data if available, otherwise fall back to variant calculation
        let bins;
        if (Array.isArray(distributionData) && distributionData.length > 0 && distributionData[0].label) {
            // Use cached distribution bins
            bins = distributionData;
            Debug.log(2, 'PGSBreakdown', 'Using cached distribution data');
        } else {
            // Fall back to calculating from variants (legacy)
            Debug.log(2, 'PGSBreakdown', 'Calculating distribution from variants (fallback)');
            const variants = distributionData;
            bins = [
                { label: '-1.0 to -0.1', min: -Infinity, max: -0.1, count: 0, sum: 0 },
                { label: '-0.1 to -0.05', min: -0.1, max: -0.05, count: 0, sum: 0 },
                { label: '-0.05 to -0.01', min: -0.05, max: -0.01, count: 0, sum: 0 },
                { label: '-0.01 to -0.001', min: -0.01, max: -0.001, count: 0, sum: 0 },
                { label: '-0.001 to 0', min: -0.001, max: 0, count: 0, sum: 0 },
                { label: '0 to 0.001', min: 0, max: 0.001, count: 0, sum: 0 },
                { label: '0.001 to 0.01', min: 0.001, max: 0.01, count: 0, sum: 0 },
                { label: '0.01 to 0.05', min: 0.01, max: 0.05, count: 0, sum: 0 },
                { label: '0.05 to 0.1', min: 0.05, max: 0.1, count: 0, sum: 0 },
                { label: '0.1 to 1.0+', min: 0.1, max: Infinity, count: 0, sum: 0 }
            ];
            
            variants.forEach(v => {
                const weight = v.effect_weight;
                const bin = bins.find(b => weight > b.min && weight <= b.max);
                if (bin) {
                    bin.count++;
                    bin.sum += weight;
                }
            });
        }
        
        Debug.log(2, 'PGSBreakdown', 'Bin counts:', bins.map(b => `${b.label}: ${b.count} (sum: ${b.sum.toFixed(4)})`));
        
        const totalSum = bins.reduce((sum, b) => sum + b.sum, 0);
        
        try {
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: bins.map(b => b.label),
                    datasets: [{
                        label: 'Variant Count',
                        data: bins.map(b => b.count),
                        backgroundColor: bins.map(b => 
                            b.label.startsWith('-') ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)'
                        ),
                        borderColor: bins.map(b => 
                            b.label.startsWith('-') ? 'rgba(76, 175, 80, 1)' : 'rgba(244, 67, 54, 1)'
                        ),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                afterLabel: (context) => {
                                    const bin = bins[context.dataIndex];
                                    const weight = bin.sum;
                                    const sign = weight >= 0 ? '+' : '';
                                    return `Total weight: ${sign}${weight.toFixed(2)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Number of Variants' }
                        },
                        x: {
                            title: { display: true, text: 'Effect Weight Range' }
                        }
                    }
                }
            });
            Debug.log(2, 'PGSBreakdown', 'Chart created successfully');
        } catch (error) {
            Debug.error('PGSBreakdown', 'Chart creation failed:', error);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `<div></div>`;
    }
}

customElements.define('pgs-breakdown', PGSBreakdown);