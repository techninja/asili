/**
 * Trait grid organism — loads manifest and renders trait cards.
 * @module components/organisms/trait-grid
 */

import { html, define } from 'hybrids';
import { getTraitList } from '../../../utils/manifest.js';
// @ts-ignore — side-effect import for web component registration
import '../../molecules/trait-card/trait-card.js';

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
  search: '',
  category: '',
  render: {
    value: ({ traits, search, category }) => {
      const filtered = filterTraits(traits, search, category);
      const categories = [...new Set(traits.flatMap((t) => t.categories || []))].sort();

      return html`
        <div class="trait-grid">
          <div class="trait-grid__controls">
            <input
              type="search"
              class="trait-grid__search"
              placeholder="Search traits…"
              value="${search}"
              oninput="${(host, e) => {
                host.search = e.target.value;
              }}"
            />
            <select
              class="trait-grid__filter"
              onchange="${(host, e) => {
                host.category = e.target.value;
              }}"
            >
              <option value="">All categories</option>
              ${categories.map((c) => html`<option value="${c}">${c}</option>`)}
            </select>
            <span class="trait-grid__count">${filtered.length} traits</span>
          </div>
          <div class="trait-grid__cards">
            ${filtered.map((t) =>
              html`
                <trait-card
                  emoji="${t.emoji || '🧬'}"
                  name="${t.name}"
                  traitType="${t.trait_type}"
                ></trait-card>
              `.key(t.trait_id),
            )}
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});

/**
 * @param {Array<object>} traits
 * @param {string} search
 * @param {string} category
 * @returns {Array<object>}
 */
function filterTraits(traits, search, category) {
  let result = traits;
  if (category) result = result.filter((t) => t.categories?.includes(category));
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((t) => t.name.toLowerCase().includes(q));
  }
  return result;
}
