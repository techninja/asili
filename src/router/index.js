/**
 * App router shell — manages view stack with View Transitions.
 * Sets transition.instance so the router's restoreLayout waits
 * for the transition before scrolling.
 * @module router
 */

import { html, define, router } from 'hybrids';
import HomeView from '#pages/home/home-view.js';

// Access the Hybrids transition module to set its instance property
// so restoreLayout knows to wait for the view transition
// @ts-ignore — vendor path resolved by import map
const transitionMod = await import('/vendor/hybrids/template/helpers/transition.js');
const transitionFn = transitionMod.default;

/** @type {Function} */
const vt =
  document.startViewTransition && transitionFn
    ? (fn) => (host, target) => {
        const inst = document.startViewTransition(() => fn(host, target));
        // Tell Hybrids' router that a transition is in progress
        transitionFn.instance = inst;
        inst.finished.finally(() => {
          transitionFn.instance = undefined;
        });
      }
    : (fn) => fn;

const tpl = ({ stack }) => html`<div class="app-router">${stack}</div>`;

export default define({
  tag: 'app-router',
  stack: router(HomeView, { transition: true }),
  render: {
    value: (host) => vt(tpl(host)),
    shadow: false,
  },
});
