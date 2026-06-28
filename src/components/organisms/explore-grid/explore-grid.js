/**
 * Explore grid — browse and search popular genes.
 * @module components/organisms/explore-grid
 */

import { html, define } from 'hybrids';
import { getGeneList } from '#utils/gene-catalog.js';
// @ts-ignore
import '#atoms/app-icon/app-icon.js';
import { filterGenes, geneCard } from './explore-grid-helpers.js';

function controls(host) {
  return html`
    <div class="explore-grid__controls">
      <input
        type="search"
        class="explore-grid__search"
        placeholder="Search genes (BRCA1, caffeine, dopamine...)"
        value="${host.search}"
        oninput="${(h, e) => {
          h.search = e.target.value;
        }}"
      />
      <select
        class="explore-grid__sort"
        onchange="${(h, e) => {
          h.sortBy = e.target.value;
        }}"
      >
        <option value="position" selected="${host.sortBy === 'position'}">Position</option>
        <option value="name" selected="${host.sortBy === 'name'}">Name</option>
        <option value="publications" selected="${host.sortBy === 'publications'}">Studies</option>
        <option value="category" selected="${host.sortBy === 'category'}">Category</option>
      </select>
      <button
        class="explore-grid__dir"
        onclick="${(h) => {
          h.sortDir = h.sortDir === 'asc' ? 'desc' : 'asc';
        }}"
        title="Toggle sort direction"
      >
        <app-icon name="${host.sortDir === 'asc' ? 'sort-asc' : 'sort-desc'}"></app-icon>
      </button>
    </div>
  `;
}

function categoryFilters(host, categories) {
  return html`
    <div class="explore-grid__filters">
      ${host.activeCategory
        ? html`<button
            class="explore-grid__cat explore-grid__cat--clear"
            onclick="${(h) => {
              h.activeCategory = '';
            }}"
          >
            ✕ Clear
          </button>`
        : html``}
      ${categories.map(
        (cat) => html`
          <button
            class="explore-grid__cat ${host.activeCategory === cat ? 'explore-grid__cat--on' : ''}"
            onclick="${(h) => {
              h.activeCategory = h.activeCategory === cat ? '' : cat;
            }}"
          >
            ${cat}
          </button>
        `,
      )}
    </div>
  `;
}

export default define({
  tag: 'explore-grid',
  genes: {
    value: /** @type {Array<object>} */ ([]),
    connect(host, _key, invalidate) {
      getGeneList().then((list) => {
        host.genes = list;
        host.categories = [...new Set(list.map((g) => g.category))].sort();
        invalidate();
      });
    },
  },
  categories: { value: /** @type {Array<string>} */ ([]), connect: () => {} },
  search: '',
  sortBy: 'position',
  sortDir: 'asc',
  activeCategory: '',
  render: {
    value: (host) => {
      const visible = filterGenes(host.genes, {
        search: host.search,
        category: host.activeCategory,
        sortBy: host.sortBy,
        sortDir: host.sortDir,
      });

      return html`
        <div class="explore-grid">
          ${controls(host)}
          ${host.categories.length ? categoryFilters(host, host.categories) : html``}
          <p class="explore-grid__status">
            Showing ${visible.length} of ${host.genes.length} genes
          </p>
          <div class="explore-grid__cards">${visible.map((g) => geneCard(g))}</div>
        </div>
      `;
    },
    shadow: false,
  },
});
