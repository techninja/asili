import { fixture, expect } from '@open-wc/testing';
import '../app-badge/app-badge.js';

describe('app-badge', () => {
  it('renders a span with label text', async () => {
    const el = await fixture(`<app-badge label="Active"></app-badge>`);
    await new Promise((r) => requestAnimationFrame(r));
    const span = el.querySelector('.badge');
    expect(span).to.exist;
    expect(span.textContent).to.contain('Active');
  });

  it('applies color variant class', async () => {
    const el = await fixture(`<app-badge label="High" color="danger"></app-badge>`);
    await new Promise((r) => requestAnimationFrame(r));
    const span = el.querySelector('.badge');
    expect(span.classList.contains('badge-danger')).to.be.true;
  });

  it('defaults to info color', async () => {
    const el = await fixture(`<app-badge label="Note"></app-badge>`);
    await new Promise((r) => requestAnimationFrame(r));
    const span = el.querySelector('.badge');
    expect(span.classList.contains('badge-info')).to.be.true;
  });
});
