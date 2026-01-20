/**
 * Virtual scroll container for trait cards
 * Only renders visible items in viewport
 */

export class VirtualTraitGrid extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.traits = [];
    this.individualId = null;
    this.itemHeight = 280;
    this.visibleCount = 20;
    this.scrollTop = 0;
    this.renderDebounce = null;
  }

  connectedCallback() {
    this.render();
    this.setupScrollListener();
  }

  disconnectedCallback() {
    if (this.renderDebounce) clearTimeout(this.renderDebounce);
  }

  setData(traits, individualId) {
    this.traits = traits;
    this.individualId = individualId;
    this.updateVirtualScroll();
  }

  setupScrollListener() {
    const container = this.shadowRoot.querySelector('.scroll-container');
    if (!container) return;

    container.addEventListener('scroll', () => {
      this.scrollTop = container.scrollTop;
      
      if (this.renderDebounce) clearTimeout(this.renderDebounce);
      this.renderDebounce = setTimeout(() => this.updateVirtualScroll(), 50);
    });
  }

  updateVirtualScroll() {
    const container = this.shadowRoot.querySelector('.scroll-container');
    const viewport = this.shadowRoot.querySelector('.viewport');
    if (!container || !viewport) return;

    const startIndex = Math.floor(this.scrollTop / this.itemHeight);
    const endIndex = Math.min(startIndex + this.visibleCount, this.traits.length);
    
    const totalHeight = this.traits.length * this.itemHeight;
    viewport.style.height = `${totalHeight}px`;

    const content = this.shadowRoot.querySelector('.content');
    content.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
    content.innerHTML = '';

    for (let i = startIndex; i < endIndex; i++) {
      const trait = this.traits[i];
      const card = document.createElement('trait-card');
      card.setData(trait, this.individualId);
      content.appendChild(card);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .scroll-container {
          height: 100%;
          overflow-y: auto;
          position: relative;
        }
        .viewport {
          position: relative;
          width: 100%;
        }
        .content {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }
      </style>
      <div class="scroll-container">
        <div class="viewport">
          <div class="content"></div>
        </div>
      </div>
    `;
  }
}

customElements.define('virtual-trait-grid', VirtualTraitGrid);
