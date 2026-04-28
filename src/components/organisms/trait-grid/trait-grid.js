/**
 * Trait grid — flat card list with multi-select category filters and sorting.
 * @module components/organisms/trait-grid
 */

import { html, define } from 'hybrids';
import { getTraitList } from '#utils/manifest.js';
// @ts-ignore
import '#molecules/trait-card/trait-card.js';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
import { getCategories, filterAndSort } from './helpers.js';
import { renderCard, loadActiveEmoji } from './render-card.js';
import { loadPrefs } from './grid-prefs.js';
import { controls, filters } from './trait-grid-controls.js';

export default define({
  tag: 'trait-grid',
  traits: {
    value: /** @type {Array<object>} */ ([]),
    connect(host, _key, invalidate) {
      getTraitList().then((list) => {
        host.traits = list;
        invalidate();
      });
    },
  },
  resultCount: {
    value: 0,
    observe(host, value) {
      if (value > 0) loadActiveEmoji();
    },
  },
  scoring: false,
  switchEpoch: {
    value: 0,
    observe() {
      loadActiveEmoji();
    },
  },
  showAll: false,
  search: '',
  sortBy: 'name',
  sortDir: 'asc',
  scoredOnly: false,
  activeCategories: { value: /** @type {Set<string>} */ (new Set()), connect: () => {} },
  _prefs: {
    value: false,
    connect(host) {
      loadPrefs(host);
    },
  },
  render: {
    value: (host) => {
      void host.resultCount;
      void host.scoring;
      void host.switchEpoch;
      const cats = getCategories(host.traits);
      const { visible, totalScored } = filterAndSort(host.traits, {
        search: host.search,
        categories: host.activeCategories,
        sortBy: host.sortBy,
        sortDir: host.sortDir,
        scoredOnly: host.scoredOnly,
      });
      const hasFilters = host.activeCategories.size > 0 || host.scoredOnly || host.search;
      return html`
        <div class="trait-grid">
          ${controls(host)} ${filters(host, cats, hasFilters)}
          <p class="trait-grid__status">
            ${totalScored} scored · showing ${visible.length} of ${host.traits.length} traits
          </p>
          <div class="trait-grid__cards">
            ${visible.map((t) => renderCard(t, host.resultCount, host.scoring))}
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});
