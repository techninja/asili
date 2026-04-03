/**
 * Icon atom — renders Lucide SVG icons by name.
 * Icons loaded from /icons.json (generated at install from lucide-static).
 * @module components/atoms/app-icon
 */

import { html, define } from 'hybrids';

/** @type {Record<string, string>|null} */
let iconCache = null;

/** @type {Promise<Record<string, string>>} */
const loading = fetch('/icons.json')
  .then((r) => {
    if (r.ok) return r;
    throw new Error('icons.json not found');
  })
  .then((r) => r.json())
  .then((data) => {
    iconCache = data;
    return data;
  })
  .catch(() => {
    iconCache = {};
    return {};
  });

/**
 * @typedef {Object} AppIconHost
 * @property {string} name
 * @property {'sm'|'md'|'lg'} size
 * @property {string} svgContent - Resolved SVG inner markup
 */

/** @type {import('hybrids').Component<AppIconHost>} */
export default define({
  tag: 'app-icon',
  name: '',
  size: 'md',
  svgContent: {
    value: '',
    connect(host, _key, invalidate) {
      loading.then(() => {
        host.svgContent = iconCache?.[host.name] || '';
        invalidate();
      });
    },
    observe(host, val) {
      const span = host.querySelector('.icon');
      if (!span) return;
      span.innerHTML = val
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${val}</svg>`
        : '';
    },
  },
  render: {
    value: ({ size }) => html`<span class="icon icon-${size}"></span>`,
    shadow: false,
  },
});
