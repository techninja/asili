/**
 * Floating bar — persistent bottom bar for scoring controls + trait pager.
 * Self-subscribes to global queue state so it works on any view.
 * @module components/molecules/floating-bar
 */

import { html, define } from 'hybrids';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
import { subscribe, getState } from '#utils/queue-state.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { errorContent, scoringContent } from './floating-bar-scoring.js';
import { detailPanel, pagerContent } from './floating-bar-helpers.js';

const ACTIVE_STATES = new Set(['scoring', 'paused', 'init', 'blocked']);

export default define({
  tag: 'floating-bar',
  prevHref: '',
  nextHref: '',
  expanded: false,
  /** @type {string} JSON cache of individual meta */
  _indCache: '{}',
  _tick: {
    value: 0,
    connect: (host, _key, invalidate) => {
      let lastWidth = 0;
      let observer = null;
      let flipPending = false;

      const doFlip = () => {
        if (flipPending) return;
        flipPending = true;
        requestAnimationFrame(() => {
          flipPending = false;
          const bar = host.querySelector('.floating-bar');
          if (!bar || !lastWidth) return;
          const newWidth = bar.offsetWidth;
          if (Math.abs(newWidth - lastWidth) > 4) {
            bar.style.transition = 'none';
            bar.style.width = lastWidth + 'px';
            void bar.offsetWidth;
            requestAnimationFrame(() => {
              bar.style.transition = '';
              bar.style.width = newWidth + 'px';
              const onEnd = () => {
                bar.style.width = '';
                bar.removeEventListener('transitionend', onEnd);
              };
              bar.addEventListener('transitionend', onEnd);
            });
          }
          lastWidth = newWidth;
        });
      };

      const unsub = subscribe(() => {
        const bar = host.querySelector('.floating-bar');
        if (bar) lastWidth = bar.offsetWidth;
        host._tick++;
        invalidate();
      });

      observer = new MutationObserver(doFlip);
      observer.observe(host, { childList: true, subtree: true, characterData: true });

      return () => {
        unsub();
        observer.disconnect();
      };
    },
  },
  render: {
    value: (host) => {
      void host._tick;
      const state = getState();
      const status = state.paused
        ? 'paused'
        : state.running
          ? 'scoring'
          : state.pending > 0 && !state.running
            ? 'blocked'
            : '';
      const hasError = !state.running && !state.paused && state.errors > 0 && state.pending === 0;
      const hasScoring = ACTIVE_STATES.has(status);
      const hasPager = host.prevHref || host.nextHref;
      if (!hasScoring && !hasError && !hasPager) return html``;

      // Warm individual cache when expanded
      if (host.expanded && state.byIndividual) {
        const cache = JSON.parse(host._indCache);
        for (const id of Object.keys(state.byIndividual)) {
          if (!cache[id]) {
            idb.get('individuals', id).then((ind) => {
              if (ind) {
                const c = JSON.parse(host._indCache);
                c[id] = { name: ind.name, emoji: ind.emoji };
                host._indCache = JSON.stringify(c);
              }
            });
          }
        }
      }

      return html`
        <div
          class="floating-bar ${hasError ? 'floating-bar--error' : ''} ${host.expanded
            ? 'floating-bar--expanded'
            : ''}"
        >
          ${hasError ? errorContent(host, state, toggleExpand) : html``}
          ${hasScoring ? scoringContent(host, state, status, toggleExpand) : html``}
          ${host.expanded ? detailPanel(state, hasError, JSON.parse(host._indCache)) : html``}
          ${hasPager ? pagerContent(host.prevHref, host.nextHref) : html``}
        </div>
      `;
    },
    shadow: false,
  },
});

/**
 *
 */
function toggleExpand(host) {
  host.expanded = !host.expanded;
}
