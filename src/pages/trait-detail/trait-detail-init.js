/**
 * Trait detail data loading — initView and individual switching.
 * @module pages/trait-detail/trait-detail-init
 */

import { results, getActiveId, loadResults } from '#pages/beta/results-store.js';
import { getTraitList, getPgsDetail } from '#utils/manifest.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { loadFamily } from './trait-detail-helpers.js';

/** Load all data for the current traitId. */
export async function initView(host) {
  const id = getActiveId();
  host.activeId = id;
  if (id && !Object.keys(results).length) await loadResults(id);

  try {
    await idb.openDB();
    const ind = await idb.get('individuals', id);
    host.indEmoji = ind?.emoji || '🧬';
  } catch {
    host.indEmoji = '🧬';
  }

  const list = await getTraitList();
  const idx = list.findIndex((t) => t.trait_id === host.traitId);
  const t = idx >= 0 ? { ...list[idx] } : {};
  t._prev = idx > 0 ? list[idx - 1].trait_id : '';
  t._next = idx < list.length - 1 ? list[idx + 1].trait_id : '';
  host.trait = t;

  // Set page title
  if (t.name) document.title = `Asili | ${t.emoji || '🧬'} ${t.name}`;

  const r = results[host.traitId];
  host.pgsMeta = r?.bestPGS ? (await getPgsDetail(r.bestPGS)) || {} : {};

  await loadFamily(host);
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleSwitch(host, e) {
  const id = e.detail;
  host.activeId = id;
  await loadResults(id);
  await initView(host);
}
