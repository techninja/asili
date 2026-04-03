/**
 * Theme toggle atom — switches between light and dark mode.
 * Persists via AppState store (localStorage-backed).
 * @module components/atoms/theme-toggle
 */

import { html, define, store } from 'hybrids';
import AppState from '../../../store/AppState.js';

/**
 * @typedef {Object} ThemeToggleHost
 * @property {import('../../../store/AppState.js').AppState} state
 */

/**
 * @param {ThemeToggleHost & HTMLElement} host
 */
function toggle(host) {
  if (!store.ready(host.state)) return;
  const next = host.state.theme === 'light' ? 'dark' : 'light';
  store.set(host.state, { theme: next });
  document.documentElement.setAttribute('data-theme', next);
}

/** @type {import('hybrids').Component<ThemeToggleHost>} */
export default define({
  tag: 'theme-toggle',
  state: store(AppState),
  render: {
    value: ({ state }) => {
      if (store.ready(state)) {
        document.documentElement.setAttribute('data-theme', state.theme);
      }
      return html`
        <button class="btn btn-ghost theme-toggle-btn" onclick="${toggle}">
          ${store.ready(state) && state.theme === 'light' ? '🌙' : '☀️'}
        </button>
      `;
    },
    shadow: false,
  },
});
