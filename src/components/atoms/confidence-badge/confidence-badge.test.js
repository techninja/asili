import { fixture, html, expect } from '@open-wc/testing';
import './confidence-badge.js';

describe('confidence-badge', () => {
  it('renders high confidence', async () => {
    const el = await fixture(html`<confidence-badge level="high"></confidence-badge>`);
    const badge = el.querySelector('.confidence-badge');
    expect(badge.textContent.trim()).to.equal('High');
    expect(badge.classList.contains('confidence-badge--success')).to.be.true;
  });

  it('renders medium confidence', async () => {
    const el = await fixture(html`<confidence-badge level="medium"></confidence-badge>`);
    const badge = el.querySelector('.confidence-badge');
    expect(badge.textContent.trim()).to.equal('Medium');
    expect(badge.classList.contains('confidence-badge--info')).to.be.true;
  });

  it('renders low confidence', async () => {
    const el = await fixture(html`<confidence-badge level="low"></confidence-badge>`);
    const badge = el.querySelector('.confidence-badge');
    expect(badge.textContent.trim()).to.equal('Low');
    expect(badge.classList.contains('confidence-badge--warning')).to.be.true;
  });

  it('renders insufficient confidence', async () => {
    const el = await fixture(html`<confidence-badge level="insufficient"></confidence-badge>`);
    const badge = el.querySelector('.confidence-badge');
    expect(badge.textContent.trim()).to.equal('Insufficient');
  });

  it('defaults to none', async () => {
    const el = await fixture(html`<confidence-badge></confidence-badge>`);
    const badge = el.querySelector('.confidence-badge');
    expect(badge.textContent.trim()).to.equal('No data');
  });
});
