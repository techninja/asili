/**
 * Trait grid — loads manifest, groups by category, renders scored cards.
 * @module components/organisms/trait-grid
 */

import { html, define, router } from 'hybrids';
import { getTraitList } from '../../../utils/manifest.js';
import { results } from '../../../pages/beta/results-store.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
// @ts-ignore
import '../../molecules/trait-card/trait-card.js';
import TraitDetailView from '../../../pages/trait-detail/trait-detail-view.js';

const CATEGORY_ORDER = [
  'Body',
  'Metabolism',
  'Cardiovascular',
  'Blood',
  'Lifestyle',
  'Appearance',
  'Nutrition',
  'Reproductive',
  'Other',
];

const CATEGORY_MAP = {
  'Body measurement': 'Body',
  'Other measurement': 'Body',
  'Cardiovascular measurement': 'Cardiovascular',
  'Cardiovascular disease': 'Cardiovascular',
  'Lipid or lipoprotein measurement': 'Metabolism',
  'Metabolic disorder': 'Metabolism',
  'Hematological measurement': 'Blood',
  'Immune system disorder': 'Blood',
};

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
  resultCount: 0,
  search: '',
  render: {
    value: ({ traits, search, resultCount }) => {
      void resultCount;
      const filtered = search
        ? traits.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
        : traits;
      const groups = groupByCategory(filtered);

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
            <span class="trait-grid__count">${filtered.length} traits</span>
          </div>
          ${groups.map(
            ([cat, items]) => html`
              <section class="trait-grid__group" key="${cat}">
                <h3 class="trait-grid__group-title">
                  ${cat} <span class="trait-grid__group-count">${items.length}</span>
                </h3>
                <div class="trait-grid__cards">${items.map((t) => renderCard(t))}</div>
              </section>
            `,
          )}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} t */
function renderCard(t) {
  const r = results[t.trait_id];
  const val = r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : '';
  return html`
    <a href="${router.url(TraitDetailView, { traitId: t.trait_id })}" class="trait-grid__link">
      <trait-card
        emoji="${t.emoji || '🧬'}"
        name="${t.name}"
        traitType="${t.trait_type || 'quantitative'}"
        percentile="${r?.percentile || 0}"
        confidence="${r?.confidence || ''}"
        value="${val}"
        unit="${t.unit || ''}"
        scored="${!!r}"
      ></trait-card>
    </a>
  `.key(t.trait_id);
}

/**
 * @param {Array<object>} traits
 * @returns {Array<[string, Array<object>]>}
 */
function groupByCategory(traits) {
  const groups = {};
  for (const t of traits) {
    const raw = t.categories?.[0] || 'Other';
    const cat = CATEGORY_MAP[raw] || raw;
    (groups[cat] ||= []).push(t);
  }
  return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => [
    c,
    groups[c].sort((a, b) => a.name.localeCompare(b.name)),
  ]);
}
