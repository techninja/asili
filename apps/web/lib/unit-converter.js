/**
 * Unit conversion library for health metrics
 */

// Locale-based default units
const LOCALE_DEFAULTS = {
  'en-US': { weight: 'lbs', height: 'in', cholesterol: 'mg/dL', temperature: '°F' },
  'en-GB': { weight: 'st', height: 'cm', cholesterol: 'mmol/L', temperature: '°C' },
  'default': { weight: 'kg', height: 'cm', cholesterol: 'mmol/L', temperature: '°C' }
};

export const UNIT_CONVERSIONS = {
  // Weight
  'kg': {
    'kg': v => v,
    'lbs': v => v * 2.20462,
    'st': v => v * 0.157473 // stones
  },
  'lbs': {
    'kg': v => v / 2.20462,
    'lbs': v => v,
    'st': v => v / 14
  },
  
  // Height
  'cm': {
    'cm': v => v,
    'in': v => v / 2.54,
    'ft': v => v / 30.48
  },
  'in': {
    'cm': v => v * 2.54,
    'in': v => v,
    'ft': v => v / 12
  },
  
  // Cholesterol/Glucose
  'mg/dL': {
    'mg/dL': v => v,
    'mmol/L': v => v / 18.0182 // for glucose
  },
  'mmol/L': {
    'mg/dL': v => v * 18.0182,
    'mmol/L': v => v
  },
  
  // Blood Pressure (no conversion, just mmHg)
  'mmHg': {
    'mmHg': v => v
  },
  
  // BMI (no conversion)
  'BMI': {
    'BMI': v => v
  },
  
  // Temperature
  '°C': {
    '°C': v => v,
    '°F': v => v * 9/5 + 32
  },
  '°F': {
    '°C': v => (v - 32) * 5/9,
    '°F': v => v
  }
};

export function getAvailableUnits(unit) {
  return Object.keys(UNIT_CONVERSIONS[unit] || {});
}

export function convertValue(value, fromUnit, toUnit) {
  if (!UNIT_CONVERSIONS[fromUnit]?.[toUnit]) {
    return value; // No conversion available
  }
  return UNIT_CONVERSIONS[fromUnit][toUnit](value);
}

export function hasConversions(unit) {
  const available = getAvailableUnits(unit);
  return available.length > 1;
}

export function getDefaultUnit(originalUnit) {
  const locale = navigator.language || 'en-US';
  const defaults = LOCALE_DEFAULTS[locale] || LOCALE_DEFAULTS['default'];
  
  // Map original units to locale preferences
  if (originalUnit === 'kg' || originalUnit === 'lbs' || originalUnit === 'st') {
    return defaults.weight;
  }
  if (originalUnit === 'cm' || originalUnit === 'in' || originalUnit === 'ft') {
    return defaults.height;
  }
  if (originalUnit === 'mg/dL' || originalUnit === 'mmol/L') {
    return defaults.cholesterol;
  }
  if (originalUnit === '°C' || originalUnit === '°F') {
    return defaults.temperature;
  }
  
  return originalUnit; // No locale preference, use original
}
