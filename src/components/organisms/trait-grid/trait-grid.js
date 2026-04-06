/**
 * Trait grid — loads manifest, groups by category, renders windowed cards.
 * Only renders visible cards (20 per group) with "Show more" expansion.
 * @module components/organisms/trait-grid
 */

import { html, define, router } from 'hybrids';
import { getTraitList } from '../../../utils/manifest.js';
import { results } from '../../../pages/beta/results-store.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';
// @ts-ignore
import '../../molecules/trait-card/trait-card.js';
import TraitDetailView from '../../../pages/trait-detail/trait-detail-view.js';
import { CATEGORY_ORDER, CATEGORY_MAP } from '../../../utils/categories.js';

const PAGE_SIZE = 20;

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
  expanded: { value: /** @type {Record<string, number>} */ ({}), connect: () => {} },
  render: {
    value: ({ traits, search, resultCount, expanded }) => {
      const filtered = search
        ? traits.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
        : traits;
      const groups = groupByCategory(filtered, resultCount > 0);

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
            <span class="trait-grid__count">
              ${resultCount > 0 ? `${resultCount} scored · ` : ''}${filtered.length} traits
            </span>
          </div>
          ${groups.map(([cat, items]) => renderGroup(cat, items, expanded, resultCount))}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {string} cat @param {Array<object>} items @param {Record<string, number>} exp @param {number} rc */
function renderGroup(cat, items, exp, rc) {
  const scoredCount = items.filter((t) => results[t.trait_id]).length;
  const isOpen = exp[cat] !== undefined ? exp[cat] > 0 : scoredCount > 0;
  const limit = exp[cat] || PAGE_SIZE;
  const visible = isOpen ? items.slice(0, limit) : [];
  const hasMore = isOpen && items.length > limit;

  return html`
    <section class="trait-grid__group">
      <h3
        class="trait-grid__group-title"
        onclick="${(host) => {
          host.expanded = { ...host.expanded, [cat]: isOpen ? 0 : PAGE_SIZE };
        }}"
      >
        <span class="trait-grid__chevron ${isOpen ? '' : 'trait-grid__chevron--closed'}">▾</span>
        ${cat}
        <span class="trait-grid__group-count">${scoredCount}/${items.length}</span>
      </h3>
      ${visible.length > 0
        ? html`
            <div class="trait-grid__cards">${visible.map((t) => renderCard(t, rc))}</div>
            ${hasMore
              ? html`<button
                  class="trait-grid__more"
                  onclick="${(host) => {
                    host.expanded = { ...host.expanded, [cat]: limit + PAGE_SIZE };
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

/** @param {object} t @param {number} rc */
function renderCard(t, rc) {
  const r = results[t.trait_id];
  const fmt =
    r?.value !== null && r?.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
  return html`
    <a href="${router.url(TraitDetailView, { traitId: t.trait_id })}" class="trait-grid__link">
      <trait-card
        emoji="${t.emoji || '🧬'}"
        name="${t.name}"
        traitType="${t.trait_type || 'quantitative'}"
        percentile="${r?.percentile || 0}"
        confidence="${r?.confidence || ''}"
        value="${fmt?.display || ''}"
        unit="${fmt?.unit || ''}"
        scored="${r ? true : false}"
      ></trait-card>
    </a>
  `.key(`${t.trait_id}:${r ? rc : 0}`);
}

/**
 * @param {Array<object>} traits
 * @param {boolean} sortScored
 * @returns {Array<[string, Array<object>]>}
 */
function groupByCategory(traits, sortScored) {
  const groups = {};
  for (const t of traits) {
    const raw = t.categories?.[0] || 'Other';
    const cat = CATEGORY_MAP[raw] || raw;
    (groups[cat] ||= []).push(t);
  }
  return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => [
    c,
    groups[c].sort((a, b) => {
      if (sortScored) {
        const as = results[a.trait_id] ? 0 : 1;
        const bs = results[b.trait_id] ? 0 : 1;
        if (as !== bs) return as - bs;
      }
      return a.name.localeCompare(b.name);
    }),
  ]);
}
