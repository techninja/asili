/**
 * Trait grid — loads manifest, groups by category, renders windowed cards.
 * Sort by name/percentile/confidence. Category filter dropdown.
 * @module components/organisms/trait-grid
 */

import { html, define } from 'hybrids';
import { getTraitList } from '#utils/manifest.js';
import { results } from '#pages/beta/results-store.js';
// @ts-ignore
import '#molecules/trait-card/trait-card.js';
import { groupByCategory, filterTraits, getCategories } from './helpers.js';
import { renderCard, loadFamilyCache } from './render-card.js';

const PAGE_SIZE = 20;

/** @type {Record<string, number>} Persists across individual switches */
const collapseState = {};

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
  search: '',
  sortBy: 'name',
  filterCategory: '',
  expanded: { value: /** @type {Record<string, number>} */ ({}), connect: () => {} },
  render: {
    value: ({ traits, search, resultCount, expanded, scoring, sortBy, filterCategory }) => {
      const filtered = filterTraits(traits, search, filterCategory);
      const groups = groupByCategory(filtered, resultCount > 0, sortBy);
      const categories = getCategories(traits);

      return html`
        <div class="trait-grid">
          <div class="trait-grid__controls">
            <input
              type="search"
              class="trait-grid__search"
              placeholder="Search traits…"
              value="${search}"
              oninput="${(h, e) => {
                h.search = e.target.value;
              }}"
            />
            <select
              class="trait-grid__filter"
              onchange="${(h, e) => {
                h.filterCategory = e.target.value;
              }}"
            >
              <option value="">All categories</option>
              ${categories.map(
                (c) => html`<option value="${c}" selected="${c === filterCategory}">${c}</option>`,
              )}
            </select>
            <select
              class="trait-grid__sort"
              onchange="${(h, e) => {
                h.sortBy = e.target.value;
              }}"
            >
              <option value="name" selected="${sortBy === 'name'}">Sort: Name</option>
              <option value="percentile" selected="${sortBy === 'percentile'}">
                Sort: Percentile
              </option>
              <option value="confidence" selected="${sortBy === 'confidence'}">
                Sort: Confidence
              </option>
            </select>
            <span class="trait-grid__count">
              ${resultCount > 0 ? `${resultCount} scored · ` : ''}${filtered.length} traits
            </span>
          </div>
          ${groups.map(([cat, items]) => renderGroup(cat, items, expanded, resultCount, scoring))}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {string} cat @param {Array<object>} items @param {Record<string, number>} exp @param {number} rc @param {boolean} scoring */
function renderGroup(cat, items, exp, rc, scoring) {
  const scoredCount = items.filter((t) => results[t.trait_id]).length;
  const stored = collapseState[cat];
  const isOpen =
    exp[cat] !== undefined ? exp[cat] > 0 : stored !== undefined ? stored > 0 : scoredCount > 0;
  const limit = exp[cat] || stored || PAGE_SIZE;
  const visible = isOpen ? items.slice(0, limit) : [];
  const hasMore = isOpen && items.length > limit;

  return html`
    <section class="trait-grid__group">
      <h3
        class="trait-grid__group-title"
        onclick="${(host) => {
          const next = isOpen ? 0 : PAGE_SIZE;
          host.expanded = { ...host.expanded, [cat]: next };
          collapseState[cat] = next;
        }}"
      >
        <span class="trait-grid__chevron ${isOpen ? '' : 'trait-grid__chevron--closed'}">▾</span>
        ${cat}
        <span class="trait-grid__group-count">${scoredCount}/${items.length}</span>
      </h3>
      ${visible.length > 0
        ? html`
            <div class="trait-grid__cards">${visible.map((t) => renderCard(t, rc, scoring))}</div>
            ${hasMore
              ? html`<button
                  class="trait-grid__more"
                  onclick="${(host) => {
                    const next = limit + PAGE_SIZE;
                    host.expanded = { ...host.expanded, [cat]: next };
                    collapseState[cat] = next;
                  }}"
                >
                  Show ${Math.min(PAGE_SIZE, items.length - limit)} more…
                </button>`
              : html``}
          `
        : html``}
    </section>
  `.key(cat);
}
