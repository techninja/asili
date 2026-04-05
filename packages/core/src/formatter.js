/**
 * Quantitative trait value formatting.
 * Maps units to display strings with appropriate precision.
 * @module packages/core/src/formatter
 */

/** @type {Record<string, {suffix: string, decimals: number}>} */
const UNIT_MAP = {
  'mg/dL': { suffix: 'mg/dL', decimals: 1 },
  'mg/L': { suffix: 'mg/L', decimals: 2 },
  'ng/mL': { suffix: 'ng/mL', decimals: 2 },
  'pg/mL': { suffix: 'pg/mL', decimals: 1 },
  'μmol/L': { suffix: 'μmol/L', decimals: 1 },
  'μg/dL': { suffix: 'μg/dL', decimals: 1 },
  'mEq/L': { suffix: 'mEq/L', decimals: 1 },
  'mIU/L': { suffix: 'mIU/L', decimals: 2 },
  'U/L': { suffix: 'U/L', decimals: 0 },
  mmHg: { suffix: 'mmHg', decimals: 0 },
  kg: { suffix: 'kg', decimals: 1 },
  'g/cm²': { suffix: 'g/cm²', decimals: 3 },
  'mm³': { suffix: 'mm³', decimals: 0 },
  fL: { suffix: 'fL', decimals: 1 },
  liters: { suffix: 'L', decimals: 2 },
  'mL/min/1.73m²': { suffix: 'mL/min/1.73m²', decimals: 0 },
  picograms: { suffix: 'pg', decimals: 1 },
  'beats/min': { suffix: 'bpm', decimals: 0 },
  milliseconds: { suffix: 'ms', decimals: 0 },
  years: { suffix: 'years', decimals: 1 },
  'kcal/day': { suffix: 'kcal/day', decimals: 0 },
  'g/day': { suffix: 'g/day', decimals: 1 },
  'drinks/week': { suffix: 'drinks/week', decimals: 1 },
  'thousand/μL': { suffix: '×10³/μL', decimals: 2 },
  'cells/μL': { suffix: 'cells/μL', decimals: 0 },
  '%': { suffix: '%', decimals: 1 },
  ratio: { suffix: '', decimals: 2 },
  BMI: { suffix: 'kg/m²', decimals: 1 },
  'kg/m²': { suffix: 'kg/m²', decimals: 1 },
  score: { suffix: '', decimals: 1 },
  'pattern scale': { suffix: '', decimals: 1 },
  grade: { suffix: '', decimals: 1 },
  count: { suffix: '', decimals: 0 },
};

/**
 * Format a quantitative trait value for display.
 * @param {number|null|undefined} value
 * @param {string} unit
 * @returns {{ display: string, value: string, unit: string }}
 */
export function formatTraitValue(value, unit) {
  if (value === null || value === undefined) return { display: '—', value: '—', unit: '' };

  const spec = UNIT_MAP[unit];
  const decimals = spec?.decimals ?? 2;
  const suffix = spec?.suffix ?? unit;

  let formatted;
  if (Math.abs(value) >= 1000) {
    formatted = Math.round(value).toLocaleString('en-US');
  } else {
    formatted = value.toFixed(decimals);
  }

  const display = suffix ? `${formatted} ${suffix}` : formatted;
  return { display, value: formatted, unit: suffix };
}
