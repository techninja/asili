import { LitElement, html, css } from 'lit';

export class ProgressBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .progress-container {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      text-align: center;
    }

    .progress-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 1rem 0;
    }

    .progress-bar {
      width: 100%;
      height: 1.5rem;
      background-color: #e5e7eb;
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 0.75rem;
    }

    .progress-fill {
      height: 100%;
      background-color: #3b82f6;
      transition: width 0.3s ease;
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progress-text {
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
    }

    .progress-details {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0;
    }
  `;

  static properties = {
    title: { type: String },
    progress: { type: Number },
    text: { type: String }
  };

  constructor() {
    super();
    this.title = '';
    this.progress = 0;
    this.text = '';
  }

  render() {
    return html`
      <div class="progress-container">
        ${this.title ? html`<h2 class="progress-title">${this.title}</h2>` : ''}
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${this.progress}%">
            <span class="progress-text">${Math.round(this.progress)}%</span>
          </div>
        </div>
        ${this.text ? html`<div class="progress-details">${this.text}</div>` : ''}
      </div>
    `;
  }
}

customElements.define('progress-bar', ProgressBar);