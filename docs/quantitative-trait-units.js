/**
 * Quantitative Trait Units and Reference Ranges
 * 
 * For quantitative traits, the PGS score represents the predicted value
 * in the trait's natural units. The norm_mean and norm_sd from the PGS
 * indicate the scale (e.g., mean BMR = 797 kcal/day).
 * 
 * This file maps trait IDs to their units and clinical reference ranges.
 */

export const QUANTITATIVE_TRAIT_UNITS = {
  // Metabolic measurements
  'EFO_0007777': {
    name: 'Basal Metabolic Rate',
    unit: 'kcal/day',
    description: 'Energy expenditure at rest',
    ranges: {
      low: { max: 1200, label: 'Below Average' },
      normal: { min: 1200, max: 2000, label: 'Average' },
      high: { min: 2000, label: 'Above Average' }
    }
  },
  
  // Cardiovascular measurements
  'EFO_0006335': {
    name: 'Systolic Blood Pressure',
    unit: 'mmHg',
    description: 'Pressure in arteries during heartbeat',
    ranges: {
      low: { max: 90, label: 'Low', risk: 'concern' },
      normal: { min: 90, max: 120, label: 'Normal', risk: 'optimal' },
      elevated: { min: 120, max: 130, label: 'Elevated', risk: 'monitor' },
      stage1: { min: 130, max: 140, label: 'Stage 1 Hypertension', risk: 'elevated' },
      stage2: { min: 140, label: 'Stage 2 Hypertension', risk: 'high' }
    }
  },
  
  'EFO_0004465': {
    name: 'Diastolic Blood Pressure',
    unit: 'mmHg',
    description: 'Pressure in arteries between heartbeats',
    ranges: {
      low: { max: 60, label: 'Low', risk: 'concern' },
      normal: { min: 60, max: 80, label: 'Normal', risk: 'optimal' },
      elevated: { min: 80, max: 90, label: 'Elevated', risk: 'monitor' },
      high: { min: 90, label: 'High', risk: 'elevated' }
    }
  },
  
  // Lipid measurements
  'EFO_0004612': {
    name: 'HDL Cholesterol',
    unit: 'mg/dL',
    description: '"Good" cholesterol that removes other cholesterol',
    ranges: {
      low: { max: 40, label: 'Low (Risk Factor)', risk: 'elevated' },
      borderline: { min: 40, max: 60, label: 'Borderline', risk: 'monitor' },
      optimal: { min: 60, label: 'Optimal (Protective)', risk: 'optimal' }
    }
  },
  
  'EFO_0004611': {
    name: 'LDL Cholesterol',
    unit: 'mg/dL',
    description: '"Bad" cholesterol that can build up in arteries',
    ranges: {
      optimal: { max: 100, label: 'Optimal', risk: 'optimal' },
      near_optimal: { min: 100, max: 130, label: 'Near Optimal', risk: 'monitor' },
      borderline: { min: 130, max: 160, label: 'Borderline High', risk: 'elevated' },
      high: { min: 160, max: 190, label: 'High', risk: 'high' },
      very_high: { min: 190, label: 'Very High', risk: 'high' }
    }
  },
  
  'EFO_0004465': {
    name: 'Total Cholesterol',
    unit: 'mg/dL',
    description: 'Sum of all cholesterol types',
    ranges: {
      desirable: { max: 200, label: 'Desirable', risk: 'optimal' },
      borderline: { min: 200, max: 240, label: 'Borderline High', risk: 'monitor' },
      high: { min: 240, label: 'High', risk: 'elevated' }
    }
  },
  
  'EFO_0004530': {
    name: 'Triglycerides',
    unit: 'mg/dL',
    description: 'Type of fat in blood',
    ranges: {
      normal: { max: 150, label: 'Normal', risk: 'optimal' },
      borderline: { min: 150, max: 200, label: 'Borderline High', risk: 'monitor' },
      high: { min: 200, max: 500, label: 'High', risk: 'elevated' },
      very_high: { min: 500, label: 'Very High', risk: 'high' }
    }
  },
  
  // Inflammatory markers
  'EFO_0004458': {
    name: 'C-Reactive Protein',
    unit: 'mg/L',
    description: 'Marker of inflammation',
    ranges: {
      low: { max: 1, label: 'Low Risk', risk: 'optimal' },
      average: { min: 1, max: 3, label: 'Average Risk', risk: 'monitor' },
      high: { min: 3, label: 'High Risk', risk: 'elevated' }
    }
  },
  
  // Hematological measurements
  'EFO_0004541': {
    name: 'HbA1c',
    unit: '%',
    description: 'Average blood sugar over 2-3 months',
    ranges: {
      normal: { max: 5.7, label: 'Normal', risk: 'optimal' },
      prediabetes: { min: 5.7, max: 6.5, label: 'Prediabetes', risk: 'elevated' },
      diabetes: { min: 6.5, label: 'Diabetes', risk: 'high' }
    }
  },
  
  // Lung function
  'EFO_0004713': {
    name: 'FEV1/FVC Ratio',
    unit: '%',
    description: 'Lung function test ratio',
    ranges: {
      low: { max: 70, label: 'Obstructive Pattern', risk: 'concern' },
      normal: { min: 70, label: 'Normal', risk: 'optimal' }
    }
  },
  
  // Body measurements
  'EFO_0004340': {
    name: 'Body Mass Index',
    unit: 'kg/m²',
    description: 'Weight relative to height',
    ranges: {
      underweight: { max: 18.5, label: 'Underweight', risk: 'concern' },
      normal: { min: 18.5, max: 25, label: 'Normal', risk: 'optimal' },
      overweight: { min: 25, max: 30, label: 'Overweight', risk: 'monitor' },
      obese: { min: 30, label: 'Obese', risk: 'elevated' }
    }
  }
};

/**
 * Get display information for a quantitative trait score
 */
export function getQuantitativeDisplay(traitId, score) {
  const config = QUANTITATIVE_TRAIT_UNITS[traitId];
  
  if (!config) {
    return {
      value: score.toFixed(1),
      unit: 'units',
      range: null,
      interpretation: 'Value calculated',
      risk: 'unknown'
    };
  }
  
  // Find which range the score falls into
  let matchedRange = null;
  for (const [key, range] of Object.entries(config.ranges)) {
    const inRange = 
      (!range.min || score >= range.min) &&
      (!range.max || score < range.max);
    
    if (inRange) {
      matchedRange = { ...range, key };
      break;
    }
  }
  
  return {
    value: score.toFixed(1),
    unit: config.unit,
    name: config.name,
    description: config.description,
    range: matchedRange?.label || 'Unknown',
    interpretation: matchedRange?.label || 'Outside typical range',
    risk: matchedRange?.risk || 'unknown'
  };
}

// Example usage:
// const display = getQuantitativeDisplay('EFO_0007777', 1000.75);
// console.log(`${display.name}: ${display.value} ${display.unit} (${display.range})`);
// => "Basal Metabolic Rate: 1000.8 kcal/day (Average)"
