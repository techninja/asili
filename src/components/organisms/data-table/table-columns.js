/**
 * Data table column definitions.
 * @module components/organisms/data-table/table-columns
 */

/* prettier-ignore */
export const COLS = [
  { id: 'name', label: 'Trait', fullLabel: 'Trait Name', on: true, required: true, group: 'score', title: 'Trait name and emoji identifier' },
  { id: 'category', label: 'Cat', fullLabel: 'Category', on: false, group: 'score', title: 'Trait category (e.g. metabolic, cardiovascular)' },
  { id: 'percentile', label: 'Pctl', fullLabel: 'Percentile', on: true, group: 'score', title: 'Population percentile — where you rank from 0–100' },
  { id: 'zScore', label: 'Z', fullLabel: 'Z-Score', on: true, group: 'score', title: 'Z-score — standard deviations from population average' },
  { id: 'value', label: 'Value', fullLabel: 'Predicted Value', on: true, group: 'score', title: 'Predicted measurement in trait-specific units' },
  { id: 'aqs', label: 'AQS', fullLabel: 'Quality Score', on: true, group: 'quality', title: 'Asili Quality Score — overall reliability 0–100' },
  { id: 'confidence', label: 'Conf', fullLabel: 'Confidence', on: false, group: 'quality', title: 'Confidence level — none, low, medium, or high' },
  { id: 'coverage', label: 'Cov%', fullLabel: 'Coverage %', on: false, group: 'quality', title: 'Variant coverage — % of PGS variants matched' },
  { id: 'r2', label: 'R²', fullLabel: 'R² Accuracy', on: false, group: 'quality', title: 'R² — published predictive accuracy of best PGS' },
  { id: 'genotyped', label: 'Geno', fullLabel: 'Genotyped Variants', on: false, group: 'detail', title: 'Genotyped — directly measured from your DNA file' },
  { id: 'imputed', label: 'Imp', fullLabel: 'Imputed Variants', on: false, group: 'detail', title: 'Imputed — statistically inferred from nearby markers' },
  { id: 'bestPGS', label: 'PGS', fullLabel: 'Best PGS ID', on: false, group: 'detail', title: 'Best PGS — highest quality score for this trait' },
  { id: 'pgsMatches', label: 'PGS♯', fullLabel: 'PGS Matches', on: false, group: 'detail', title: 'Variants matched for the best PGS (affects score)' },
  { id: 'traitMatches', label: 'All♯', fullLabel: 'Trait Matches', on: false, group: 'detail', title: 'Total variants matched across all PGS for this trait' },
  { id: 'pgsCount', label: '#PGS', fullLabel: 'PGS Count', on: false, group: 'detail', title: 'Number of distinct polygenic scores evaluated' },
  { id: 'rawScore', label: 'Raw', fullLabel: 'Raw Score', on: false, group: 'detail', title: 'Raw PGS sum — unscaled score before normalization' },
];

/** @type {Map<string, object>} */
export const COL_MAP = new Map(COLS.map((c) => [c.id, c]));

export const GROUPS = [
  { id: 'score', label: 'Score' },
  { id: 'quality', label: 'Quality' },
  { id: 'detail', label: 'Detail' },
];

/** Format a number compactly: 1234 → "1.2k", 1234567 → "1.2m" */
export function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (n >= 1e3) return n.toLocaleString();
  return String(n);
}
