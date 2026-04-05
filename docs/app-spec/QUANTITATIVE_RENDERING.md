# Quantitative Trait Rendering

## Problem

Quantitative traits have 40+ different units across 89 traits. Some units are straightforward ("mg/dL"), some are ambiguous ("score"), and some are broken ("binary" classified as quantitative). The app needs a rendering strategy that handles all cases without showing nonsensical output like "2.3 varies".

## Rendering Categories

Each unit maps to a rendering strategy. The app uses this mapping to decide how to display the predicted value.

### Standard Units — display as `{value} {unit}`

These have well-defined units that users can understand:

| Unit          | Display             | Precision  | Example            |
| ------------- | ------------------- | ---------- | ------------------ |
| mg/dL         | `{v} mg/dL`         | 1 decimal  | "142.3 mg/dL"      |
| mg/L          | `{v} mg/L`          | 2 decimals | "1.45 mg/L"        |
| ng/mL         | `{v} ng/mL`         | 2 decimals | "32.10 ng/mL"      |
| pg/mL         | `{v} pg/mL`         | 1 decimal  | "4.2 pg/mL"        |
| μmol/L        | `{v} μmol/L`        | 1 decimal  | "312.5 μmol/L"     |
| μg/dL         | `{v} μg/dL`         | 1 decimal  | "95.3 μg/dL"       |
| mEq/L         | `{v} mEq/L`         | 1 decimal  | "4.2 mEq/L"        |
| mIU/L         | `{v} mIU/L`         | 2 decimals | "2.45 mIU/L"       |
| U/L           | `{v} U/L`           | 0 decimals | "28 U/L"           |
| mmHg          | `{v} mmHg`          | 0 decimals | "120 mmHg"         |
| kg            | `{v} kg`            | 1 decimal  | "78.5 kg"          |
| g/cm²         | `{v} g/cm²`         | 3 decimals | "1.045 g/cm²"      |
| mm³           | `{v} mm³`           | 0 decimals | "7,234 mm³"        |
| fL            | `{v} fL`            | 1 decimal  | "87.2 fL"          |
| liters        | `{v} L`             | 2 decimals | "3.45 L"           |
| mL/min/1.73m² | `{v} mL/min/1.73m²` | 0 decimals | "92 mL/min/1.73m²" |
| picograms     | `{v} pg`            | 1 decimal  | "29.4 pg"          |
| beats/min     | `{v} bpm`           | 0 decimals | "72 bpm"           |
| milliseconds  | `{v} ms`            | 0 decimals | "420 ms"           |
| years         | `{v} years`         | 1 decimal  | "12.3 years"       |
| kcal/day      | `{v} kcal/day`      | 0 decimals | "2,100 kcal/day"   |
| g/day         | `{v} g/day`         | 1 decimal  | "12.5 g/day"       |
| drinks/week   | `{v} drinks/week`   | 1 decimal  | "4.2 drinks/week"  |
| thousand/μL   | `{v} ×10³/μL`       | 2 decimals | "6.45 ×10³/μL"     |
| cells/μL      | `{v} cells/μL`      | 0 decimals | "1,200 cells/μL"   |

### Percentage — display as `{value}%`

| Unit | Display | Precision | Example |
| ---- | ------- | --------- | ------- |
| %    | `{v}%`  | 1 decimal | "45.2%" |

### Ratio — display value only, no unit suffix

| Unit  | Display | Precision  | Example |
| ----- | ------- | ---------- | ------- |
| ratio | `{v}`   | 2 decimals | "0.87"  |

### Composite — unit needs translation

| Unit         | Display     | Precision | Example                |
| ------------ | ----------- | --------- | ---------------------- |
| BMI          | `{v} kg/m²` | 1 decimal | "27.4 kg/m²"           |
| cm or inches | `{v} cm`    | 1 decimal | "90.2 cm" (use metric) |
| mm or %      | `{v} mm`    | 1 decimal | "30.2 mm" (use mm)     |

### Score-like — display with context

| Unit          | Display | Precision  | Notes                             |
| ------------- | ------- | ---------- | --------------------------------- |
| score         | `{v}`   | 1 decimal  | Needs editorial context per trait |
| pattern scale | `{v}`   | 1 decimal  | e.g., Hamilton baldness scale     |
| grade         | `{v}`   | 1 decimal  |                                   |
| count         | `{v}`   | 0 decimals | Integer display                   |

### Broken — should NOT render a quantitative value

| Unit     | Problem                        | Fix                                                     |
| -------- | ------------------------------ | ------------------------------------------------------- |
| binary   | Not quantitative — it's yes/no | Override `trait_type` to `disease_risk`                 |
| genotype | Categorical, not continuous    | Override `trait_type` to `disease_risk`                 |
| varies   | Meaningless unit               | Override with specific unit or change to `disease_risk` |

These need editorial overrides in `trait_overrides.json` to fix the `trait_type` or `unit`.

## Implementation

### Unit Formatter Function

A pure function in `packages/core/src/utils/format-value.js`:

```js
/**
 * Format a quantitative trait value for display.
 * @param {number} value - The predicted value
 * @param {string} unit - The unit from the trait manifest
 * @returns {{ display: string, value: string, unit: string }}
 */
export function formatTraitValue(value, unit) { ... }
```

Returns an object so the component can render value and unit separately if needed (e.g., large value + small unit label).

### Precision Rules

1. If `|value| >= 1000`: 0 decimals, add thousands separator
2. If `|value| >= 1`: use unit-specific precision (see tables above)
3. If `|value| < 1`: 2-3 decimals depending on unit
4. If `value` is null/undefined: return `{ display: '—', value: '—', unit: '' }`

### Fallback

If the unit is not in the mapping, display as `{value} {unit}` with 2 decimal precision. This handles future units without code changes.

## Editorial Override Requirements

For the 44 public launch traits, every quantitative trait MUST have:

1. `unit` — a valid unit from the mapping above (not "varies" or "binary")
2. `phenotype_mean` — population mean for value calculation
3. `phenotype_sd` — population standard deviation
4. `reference_population` — where the mean/SD came from (e.g., "UK Biobank")

Without all four, the trait should render as percentile-only (no predicted value).

## What the User Sees

### Disease Risk Traits

```
┌─────────────────────────────┐
│ 🫀 Coronary Artery Disease  │
│                             │
│  ████████░░  78th %ile      │
│                             │
│  Slightly elevated risk     │
│  Confidence: High           │
└─────────────────────────────┘
```

### Quantitative Traits (with value)

```
┌─────────────────────────────┐
│ ⚖️ Body Mass Index          │
│                             │
│  ████████░░  82nd %ile      │
│                             │
│  Predicted: 28.7 kg/m²      │
│  Population avg: 27.4 kg/m² │
│  Confidence: High           │
└─────────────────────────────┘
```

### Quantitative Traits (percentile only, missing phenotype data)

```
┌─────────────────────────────┐
│ 🧠 Neuroticism              │
│                             │
│  ██████░░░░  62nd %ile      │
│                             │
│  Above average              │
│  Confidence: Medium         │
└─────────────────────────────┘
```

### Low Confidence / Sparse Data

```
┌─────────────────────────────┐
│ 📏 Height                   │
│                             │
│  ░░░░░░░░░░  —             │
│                             │
│  Low coverage (3.2%)        │
│  Impute for better results →│
└─────────────────────────────┘
```
