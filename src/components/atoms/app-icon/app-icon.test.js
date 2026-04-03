import { fixture, expect } from '@open-wc/testing';
import '../app-icon/app-icon.js';

const frame = () => new Promise((r) => requestAnimationFrame(r));

describe('app-icon', () => {
  it('renders a span with icon class', async () => {
    const el = await fixture(`<app-icon name="plus"></app-icon>`);
    await frame();
    const span = el.querySelector('.icon');
    expect(span).to.exist;
  });

  it('applies size class', async () => {
    const el = await fixture(`<app-icon name="check" size="lg"></app-icon>`);
    await frame();
    expect(el.querySelector('.icon-lg')).to.exist;
  });

  it('applies sm size class', async () => {
    const el = await fixture(`<app-icon name="check" size="sm"></app-icon>`);
    await frame();
    expect(el.querySelector('.icon-sm')).to.exist;
  });

  it('reflects name property', async () => {
    const el = await fixture(`<app-icon name="folder"></app-icon>`);
    expect(el.name).to.equal('folder');
  });
});
