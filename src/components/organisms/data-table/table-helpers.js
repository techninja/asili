/**
 * Data table helpers — row building, sorting, data loading.
 * @module components/organisms/data-table/table-helpers
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { formatTraitValue } from '/packages/core/src/formatter.js';

/** @param {Array} traits @param {Array} indResults */
export function buildRows(traits, indResults) {
  const rows = [];
  for (const ind of indResults) {
    const res = ind.results || {};
    for (const t of traits) {
      const r = res[t.trait_id];
      if (!r) continue;
      const det = r.bestPGS && r.pgsDetails?.[r.bestPGS];
      const fmt =
        r.value !== null && r.value !== undefined ? formatTraitValue(r.value, t.unit) : null;
      rows.push({
        _ind: `${ind.emoji || ''} ${ind.name || ''}`.trim(),
        name: `${t.emoji || '🧬'} ${t.name}`,
        percentile: r.percentile !== null ? Math.round(r.percentile) : null,
        zScore: r.zScore !== null ? +r.zScore.toFixed(2) : null,
        value: fmt?.display || '—',
        confidence: r.confidence || '',
        coverage: det?.coverage !== null ? Math.round((det?.coverage || 0) * 100) : null,
        bestPGS: r.bestPGS || '',
        matches: r.totalMatches || 0,
      });
    }
  }
  return rows;
}

/** 3-state sort toggle: off → asc → desc → off */
export function toggleSort(host, colId) {
  const cur = host.sorts.find((s) => s.id === colId);
  let next;
  if (!cur) next = [...host.sorts, { id: colId, dir: 'asc' }];
  else if (cur.dir === 'asc')
    next = host.sorts.map((s) => (s.id === colId ? { ...s, dir: 'desc' } : s));
  else next = host.sorts.filter((s) => s.id !== colId);
  host.sorts = next;
}

/** @param {Array} sorts @param {string} colId */
export function sortIcon(sorts, colId) {
  const s = sorts.find((x) => x.id === colId);
  if (!s) return '';
  return s.dir === 'asc' ? ' ↑' : ' ↓';
}

/** @param {Array} rows @param {Array} sorts */
export function applySort(rows, sorts) {
  if (!sorts.length) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const av = a[s.id] ?? '',
        bv = b[s.id] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

/** @param {object} host */
export async function loadAll(host) {
  await idb.openDB();
  const inds = await idb.getAll('individuals');
  const keys = await idb.getAllKeys('results');
  for (const ind of inds) {
    ind.results = {};
    for (const k of keys) {
      if (String(k).startsWith(`${ind.id}:`)) {
        const r = await idb.get('results', k);
        if (r?.traitId) ind.results[r.traitId] = r;
      }
    }
  }
  host.allResults = inds;
}
