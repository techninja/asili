import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Inline pure functions from table-helpers.js since the module
 * imports browser-only deps (idb.js). These match the source exactly.
 */

/** 3-state sort toggle: off → asc → desc → off */
function toggleSort(host, colId) {
  const cur = host.sorts.find((s) => s.id === colId);
  let next;
  if (!cur) next = [...host.sorts, { id: colId, dir: 'asc' }];
  else if (cur.dir === 'asc')
    next = host.sorts.map((s) => (s.id === colId ? { ...s, dir: 'desc' } : s));
  else next = host.sorts.filter((s) => s.id !== colId);
  host.sorts = next;
}

function sortDir(sorts, colId) {
  const s = sorts.find((x) => x.id === colId);
  return s?.dir || null;
}

function applySort(rows, sorts) {
  if (!sorts.length) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const sortKey = s.id === 'name' ? '_sortName' : s.id;
      const av = a[sortKey] ?? '',
        bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

describe('applySort', () => {
  const rows = [
    { name: 'B', _sortName: 'B', percentile: 80, zScore: 1.0 },
    { name: 'A', _sortName: 'A', percentile: 20, zScore: -1.0 },
    { name: 'C', _sortName: 'C', percentile: 50, zScore: 0.0 },
  ];

  it('sorts ascending by string', () => {
    const sorted = applySort(rows, [{ id: 'name', dir: 'asc' }]);
    assert.equal(sorted[0].name, 'A');
    assert.equal(sorted[2].name, 'C');
  });

  it('sorts descending by number', () => {
    const sorted = applySort(rows, [{ id: 'percentile', dir: 'desc' }]);
    assert.equal(sorted[0].percentile, 80);
    assert.equal(sorted[2].percentile, 20);
  });

  it('multi-column sort', () => {
    const duped = [...rows, { name: 'A', _sortName: 'A', percentile: 90, zScore: 2.0 }];
    const sorted = applySort(duped, [
      { id: 'name', dir: 'asc' },
      { id: 'percentile', dir: 'desc' },
    ]);
    assert.equal(sorted[0].name, 'A');
    assert.equal(sorted[0].percentile, 90);
    assert.equal(sorted[1].percentile, 20);
  });

  it('sorts name column by _sortName not emoji', () => {
    const r = [
      { name: '🫀 Zebra', _sortName: 'Zebra', percentile: 10 },
      { name: '🧬 Apple', _sortName: 'Apple', percentile: 90 },
    ];
    const sorted = applySort(r, [{ id: 'name', dir: 'asc' }]);
    assert.equal(sorted[0]._sortName, 'Apple');
    assert.equal(sorted[1]._sortName, 'Zebra');
  });

  it('returns original order with no sorts', () => {
    const sorted = applySort(rows, []);
    assert.equal(sorted[0].name, 'B');
  });

  it('handles null values gracefully', () => {
    const withNull = [
      { name: 'A', percentile: null },
      { name: 'B', percentile: 50 },
    ];
    const sorted = applySort(withNull, [{ id: 'percentile', dir: 'asc' }]);
    assert.equal(sorted.length, 2);
  });
});

describe('toggleSort', () => {
  it('adds ascending sort for new column', () => {
    const host = { sorts: [] };
    toggleSort(host, 'name');
    assert.equal(host.sorts.length, 1);
    assert.equal(host.sorts[0].dir, 'asc');
  });

  it('toggles asc → desc', () => {
    const host = { sorts: [{ id: 'name', dir: 'asc' }] };
    toggleSort(host, 'name');
    assert.equal(host.sorts[0].dir, 'desc');
  });

  it('toggles desc → remove', () => {
    const host = { sorts: [{ id: 'name', dir: 'desc' }] };
    toggleSort(host, 'name');
    assert.equal(host.sorts.length, 0);
  });

  it('preserves other sorts', () => {
    const host = {
      sorts: [
        { id: 'a', dir: 'asc' },
        { id: 'b', dir: 'desc' },
      ],
    };
    toggleSort(host, 'a');
    assert.equal(host.sorts.length, 2);
    assert.equal(host.sorts[0].dir, 'desc');
    assert.equal(host.sorts[1].id, 'b');
  });
});

describe('sortDir', () => {
  it('returns dir for active sort', () => {
    assert.equal(sortDir([{ id: 'a', dir: 'asc' }], 'a'), 'asc');
    assert.equal(sortDir([{ id: 'a', dir: 'desc' }], 'a'), 'desc');
  });

  it('returns null for inactive column', () => {
    assert.equal(sortDir([{ id: 'a', dir: 'asc' }], 'b'), null);
    assert.equal(sortDir([], 'a'), null);
  });
});
