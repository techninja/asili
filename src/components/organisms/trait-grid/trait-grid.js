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
import { renderCard, loadFamilyCache } from './render-card.js';
import { loadPrefs, savePrefs, toggleDir, toggleCat, clearFilters } from './grid-prefs.js';

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
      if (value > 0) loadFamilyCache();
    },
  },
  scoring: false,
  switchEpoch: 0,
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
          <div class="trait-grid__controls">
            <input
              type="search"
              class="trait-grid__search"
              placeholder="Search traits…"
              value="${host.search}"
              oninput="${(h, e) => {
                h.search = e.target.value;
              }}"
            />
            <select
              class="trait-grid__sort"
              onchange="${(h, e) => {
                h.sortBy = e.target.value;
                savePrefs(h);
              }}"
            >
              <option value="name" selected="${host.sortBy === 'name'}">Name</option>
              <option value="percentile" selected="${host.sortBy === 'percentile'}">
                Percentile
              </option>
              <option value="zscore" selected="${host.sortBy === 'zscore'}">|Z-score|</option>
              <option value="scored" selected="${host.sortBy === 'scored'}">Last scored</option>
            </select>
            <button class="trait-grid__dir" onclick="${toggleDir}" title="Toggle sort direction">
              <app-icon name="${host.sortDir === 'asc' ? 'sort-asc' : 'sort-desc'}"></app-icon>
            </button>
            <label class="trait-grid__switch">
              <input
                type="checkbox"
                checked="${host.scoredOnly}"
                onchange="${(h, e) => {
                  h.scoredOnly = e.target.checked;
                  savePrefs(h);
                }}"
              />
              <span class="trait-grid__switch-track"></span>
              Scored
            </label>
          </div>
          <div class="trait-grid__filters">
            ${cats.map(
              (c) => html`
                <button
                  class="trait-grid__cat ${host.activeCategories.has(c)
                    ? 'trait-grid__cat--on'
                    : ''}"
                  onclick="${(h) => toggleCat(h, c)}"
                >
                  ${c}
                </button>
              `,
            )}
            ${hasFilters
              ? html`<button
                  class="trait-grid__cat trait-grid__cat--clear"
                  onclick="${clearFilters}"
                >
                  <app-icon name="filter-x"></app-icon>
                </button>`
              : html``}
          </div>
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
