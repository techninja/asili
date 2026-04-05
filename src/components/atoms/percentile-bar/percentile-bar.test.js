import { fixture, html, expect } from '@open-wc/testing';
import './percentile-bar.js';

describe('percentile-bar', () => {
  it('renders with a value', async () => {
    const el = await fixture(html`<percentile-bar value="75"></percentile-bar>`);
    const label = el.querySelector('.percentile-bar__label');
    expect(label.textContent).to.contain('75th %ile');
  });

  it('renders fill width matching value', async () => {
    const el = await fixture(html`<percentile-bar value="50"></percentile-bar>`);
    const fill = el.querySelector('.percentile-bar__fill');
    expect(fill.style.width).to.equal('50%');
  });

  it('clamps value to 0-100', async () => {
    const el = await fixture(html`<percentile-bar value="150"></percentile-bar>`);
    const fill = el.querySelector('.percentile-bar__fill');
    expect(fill.style.width).to.equal('100%');
  });

  it('handles zero value', async () => {
    const el = await fixture(html`<percentile-bar value="0"></percentile-bar>`);
    const fill = el.querySelector('.percentile-bar__fill');
    expect(fill.style.width).to.equal('0%');
  });
});
