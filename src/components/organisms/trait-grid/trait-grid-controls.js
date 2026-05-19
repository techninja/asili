/**
 * Trait grid controls — search, sort, toggles, category filters.
 * @module components/organisms/trait-grid/trait-grid-controls
 */

import { html } from 'hybrids';
import { savePrefs, toggleDir, toggleCat, clearFilters } from './grid-prefs.js';
import { setShowFamily, loadFamilyCache } from './render-card.js';

/**
 *
 */
export function controls(host) {
  return html`
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
        <option value="percentile" selected="${host.sortBy === 'percentile'}">Percentile</option>
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
        <span class="trait-grid__switch-track"></span> Scored
      </label>
      <label class="trait-grid__switch">
        <input type="checkbox" checked="${host.showAll}" onchange="${toggleAll}" />
        <span class="trait-grid__switch-track"></span> All
      </label>
    </div>
  `;
}

/**
 *
 */
export function filters(host, cats, hasFilters) {
  return html`
    <div class="trait-grid__filters">
      ${cats.map(
        (c) => html`
          <button
            class="trait-grid__cat ${host.activeCategories.has(c) ? 'trait-grid__cat--on' : ''}"
            onclick="${(h) => toggleCat(h, c)}"
          >
            ${c}
          </button>
        `,
      )}
      ${hasFilters
        ? html`<button class="trait-grid__cat trait-grid__cat--clear" onclick="${clearFilters}">
            <app-icon name="filter-x"></app-icon>
          </button>`
        : html``}
    </div>
  `;
}

/**
 *
 */
async function toggleAll(host, e) {
  const checked = e.target.checked;
  host.showAll = checked;
  setShowFamily(checked);
  if (checked) {
    await loadFamilyCache();
    host.switchEpoch = Date.now();
  }
}
