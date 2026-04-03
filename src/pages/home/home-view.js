/**
 * Home page — demonstrates localStorage-backed state.
 * @module pages/home
 */

import { html, define, store } from 'hybrids';
import AppState from '../../store/AppState.js';
import '../../components/atoms/app-button/app-button.js';

/**
 * @typedef {Object} HomeViewHost
 * @property {import('../../store/AppState.js').AppState} state
 */

/** @param {HomeViewHost & HTMLElement} host */
function increment(host) {
  if (!store.ready(host.state)) return;
  store.set(host.state, { count: host.state.count + 1 });
}

export default define({
  tag: 'home-view',
  state: store(AppState),
  render: {
    value: ({ state }) => html`
      <div class="home-view">
        <h1>asili</h1>
        <p>Your Clearstack project is ready. Start building!</p>
        ${store.ready(state) &&
        html`
          <p>Count: ${state.count}</p>
          <button class="btn btn-primary" onclick="${increment}">Increment</button>
          <p class="hint">State persists in localStorage — refresh to verify.</p>
        `}
      </div>
    `,
    shadow: false,
  },
});
