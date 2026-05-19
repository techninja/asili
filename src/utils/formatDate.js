/**
 * Date formatting helpers.
 * @module utils/formatDate
 */

/**
 * Format an ISO 8601 string to a readable date.
 * @param {string|null|undefined} iso - ISO date string
 * @returns {string} Formatted date or empty string
 */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format an ISO 8601 string to relative time (e.g. "3 days ago").
 * @param {string|null|undefined} iso - ISO date string
 * @returns {string} Relative time or empty string
 */
export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (isNaN(seconds)) return '';

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];

  for (const { label, seconds: s } of intervals) {
    const count = Math.floor(seconds / s);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/**
 * Abbreviate large numbers: 1234 → "1.2K", 1234567 → "1.2M".
 * @param {number} n
 * @returns {string}
 */
export function fmtNum(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

/**
 * Format "X of Y (Z%)" coverage string.
 * @param {number} matched
 * @param {number} total
 * @returns {string}
 */
export function fmtCoverage(matched, total) {
  if (!total) return `${fmtNum(matched)} variants`;
  const pct = Math.round((matched / total) * 100);
  return `${fmtNum(matched)} of ${fmtNum(total)} variants (${pct}%)`;
}
