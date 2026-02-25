/**
 * Unit mappings for quantitative traits
 * Maps trait IDs to their measurement units
 */

export const QUANTITATIVE_UNITS = {
  'EFO_0007777': 'kcal/day',        // Basal metabolic rate
  'EFO_0006335': 'mmHg',            // Systolic blood pressure
  'EFO_0004465': 'mmHg',            // Diastolic blood pressure
  'EFO_0004612': 'mg/dL',           // HDL cholesterol
  'EFO_0004611': 'mg/dL',           // LDL cholesterol
  'EFO_0004574': 'mg/dL',           // Total cholesterol
  'EFO_0004530': 'mg/dL',           // Triglycerides
  'EFO_0004458': 'mg/L',            // C-reactive protein
  'EFO_0004541': '%',               // HbA1c
  'EFO_0004340': 'kg/m²',           // BMI
  'EFO_0004338': 'kg',              // Body weight
  'EFO_0004713': '%',               // FEV1/FVC ratio
  'EFO_0004462': 'ms',              // PR interval
  'EFO_0005278': 'units',           // Cardiovascular biomarker (generic)
  'EFO_0005106': '%',               // Body composition (likely body fat %)
  'EFO_0004703': 'years',           // Age at menarche
  'OBA_1001005': 'μmol/L',          // Creatine level
  'EFO_0005035': 'mm³',             // Hippocampal volume
  'EFO_0009395': 'mm³',             // Hippocampal CA3 volume
  'OBA_2045237': 'mm³'              // Dentate gyrus volume
};

export function getQuantitativeUnit(traitId) {
  return QUANTITATIVE_UNITS[traitId] || 'units';
}
