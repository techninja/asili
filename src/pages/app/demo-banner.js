/**
 * Demo mode banner — shown when viewing pre-loaded sample data.
 * @module pages/app/beta-demo-banner
 */

import { html } from 'hybrids';

/** @returns {ReturnType<import('hybrids').html>} */
export function demoBanner() {
  return html`
    <div class="demo-banner">
      <span class="demo-banner__text"
        >👋 You're viewing sample data — <strong>Alex</strong> (raw) and
        <strong>Jordan</strong> (imputed ⭐)</span
      >
      <button
        class="btn btn-primary demo-banner__cta"
        onclick="${async (h) => {
          if (h.isDemo) {
            const idb = await import('/packages/core/src/data-layer/idb.js');
            await idb.openDB();
            for (const ind of h.individuals) {
              if (ind.isDemo) {
                await idb.del('individuals', ind.id);
              }
            }
            await idb.clear('results');
            h.individuals = [];
            h.isDemo = false;
            h.resultCount = 0;
          }
          h.showUpload = true;
        }}"
      >
        Upload your DNA →
      </button>
    </div>
  `;
}
