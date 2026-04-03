import { fixture, expect, oneEvent } from '@open-wc/testing';
import '../app-button/app-button.js';

describe('app-button', () => {
  it('renders a button with label', async () => {
    const el = await fixture(`<app-button label="Click me"></app-button>`);
    await new Promise((r) => requestAnimationFrame(r));
    const btn = el.querySelector('button');
    expect(btn).to.exist;
    expect(btn.textContent).to.contain('Click me');
  });

  it('applies variant class', async () => {
    const el = await fixture(`<app-button label="Go" variant="danger"></app-button>`);
    await new Promise((r) => requestAnimationFrame(r));
    const btn = el.querySelector('button');
    expect(btn.classList.contains('btn-danger')).to.be.true;
  });

  it('defaults to primary variant', async () => {
    const el = await fixture(`<app-button label="Go"></app-button>`);
    await new Promise((r) => requestAnimationFrame(r));
    const btn = el.querySelector('button');
    expect(btn.classList.contains('btn-primary')).to.be.true;
  });

  it('reflects disabled attribute to button', async () => {
    const el = await fixture(`<app-button label="No" disabled></app-button>`);
    await new Promise((r) => requestAnimationFrame(r));
    const btn = el.querySelector('button');
    expect(btn.disabled).to.be.true;
  });

  it('dispatches press event on click', async () => {
    const el = await fixture(`<app-button label="Go"></app-button>`);
    await new Promise((r) => requestAnimationFrame(r));
    const btn = el.querySelector('button');
    setTimeout(() => btn.click());
    const event = await oneEvent(el, 'press');
    expect(event).to.exist;
  });
});
