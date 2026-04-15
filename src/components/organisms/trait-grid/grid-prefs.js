/**
 * Trait grid preferences — persist sort/filter state to localStorage.
 * @module components/organisms/trait-grid/grid-prefs
 */

const KEY = 'asili_gridPrefs';

/** @param {object} host */
export function loadPrefs(host) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (s.sortBy) host.sortBy = s.sortBy;
    if (s.sortDir) host.sortDir = s.sortDir;
    if (s.scoredOnly) host.scoredOnly = s.scoredOnly;
    if (s.categories?.length) host.activeCategories = new Set(s.categories);
  } catch {
    /* no saved prefs */
  }
}

/** @param {object} host */
export function savePrefs(host) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      sortBy: host.sortBy,
      sortDir: host.sortDir,
      scoredOnly: host.scoredOnly,
      categories: [...host.activeCategories],
    }),
  );
}

/** @param {object} host */
export function toggleDir(host) {
  host.sortDir = host.sortDir === 'asc' ? 'desc' : 'asc';
  savePrefs(host);
}

/** @param {object} host @param {string} cat */
export function toggleCat(host, cat) {
  const next = new Set(host.activeCategories);
  next.has(cat) ? next.delete(cat) : next.add(cat);
  host.activeCategories = next;
  savePrefs(host);
}

/** @param {object} host */
export function clearFilters(host) {
  host.activeCategories = new Set();
  host.scoredOnly = false;
  host.search = '';
  savePrefs(host);
}
