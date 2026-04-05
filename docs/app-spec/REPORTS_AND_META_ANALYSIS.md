# Reports & Meta-Analysis

## Overview

Beyond individual trait cards, Asili can generate category-level summaries and printable reports. This is both a user value feature (take to a consultation) and a revenue opportunity (premium report generation for imputed users).

## Category Radar Chart

### Data Source

Group scored traits by PGS Catalog category, compute average percentile per category:

```sql
SELECT categories,
  COUNT(*) as traits,
  AVG(overall_percentile) as avg_percentile,
  SUM(CASE WHEN overall_percentile > 75 THEN 1 ELSE 0 END) as elevated,
  SUM(CASE WHEN overall_percentile < 25 THEN 1 ELSE 0 END) as low
FROM trait_results tr
JOIN traits t ON tr.trait_id = t.trait_id
WHERE individual_id = ?
GROUP BY categories
```

### Primary Categories (for radar chart axes)

Collapse the 25+ raw categories into ~8 display categories:

| Display Category | Source Categories                                           |
| ---------------- | ----------------------------------------------------------- |
| Cancer           | Cancer, Cancer+\*                                           |
| Cardiovascular   | Cardiovascular disease, Cardiovascular measurement          |
| Metabolic        | Metabolic disorder, Lipid or lipoprotein measurement        |
| Neurological     | Neurological disorder                                       |
| Immune           | Immune system disorder                                      |
| Digestive        | Digestive system disorder                                   |
| Blood            | Hematological measurement                                   |
| Body             | Body measurement, Other measurement (anthropometric subset) |

### Radar Chart

Each axis represents a category. The value is the average percentile (0-100) for that category, with 50 as the center (population average).

```
              Cancer (37%)
                 ╱╲
    Immune (52%)╱  ╲ Cardio (47%)
               ╱    ╲
  Digest (54%)╱──────╲ Metabolic (69%)
              ╲      ╱
   Blood (80%) ╲    ╱ Neuro (48%)
                ╲  ╱
              Body (50%)
```

Points outside the center ring = above average. Inside = below average. The shape tells a story at a glance.

### Family Overlay

Overlay multiple individuals on the same radar chart with different colors/opacity. Immediately shows where family members diverge.

## Printable Report

### Structure

A multi-page document designed for print/PDF, suitable for bringing to a healthcare consultation.

```
Page 1: Cover
  - Individual name, date generated, Asili version
  - Privacy notice: "This report was generated locally. Asili never stored your data."
  - Disclaimer: "This is not a medical diagnosis. Consult a healthcare professional."

Page 2: Summary Dashboard
  - Category radar chart
  - Key stats: total traits scored, coverage %, data quality
  - Top 5 elevated traits, Top 5 below-average traits

Page 3-N: Category Sections (one per category with ≥3 traits)
  - Category name and description
  - Trait table: name, percentile, z-score, confidence, predicted value
  - Mini bar chart showing distribution within category
  - Notable variants (if any top variants are in well-known genes)

Page N+1: Data Quality
  - Coverage summary (genotyped vs imputed)
  - PGS quality score distribution
  - Which PGS were selected and why
  - Date of PGS Catalog data, date of scoring

Page N+2: Glossary
  - What is a polygenic risk score?
  - What does percentile mean?
  - What is imputation?
  - Limitations and caveats
```

### Implementation

Render as HTML with print-optimized CSS (`@media print`). Use `@page` rules for margins, headers, footers. The browser's native Print → Save as PDF handles the conversion.

No server-side PDF generation needed. The report is a route in the app (`/report/{individualId}`) that renders a print-friendly layout.

### Upsell Opportunity

| Tier                   | Report Access                                        |
| ---------------------- | ---------------------------------------------------- |
| Public (free, browser) | Summary page only (radar chart + top 5 elevated/low) |
| Public + imputation    | Full report with all categories and variant details  |
| Self-hosted (Docker)   | Full report, all 600+ traits                         |

The summary page is the teaser. "Want the full 12-page report with variant-level detail? Impute your DNA for $7.99."

## Temporal Tracking

### Why Dates Matter

- PGS Catalog publishes new scores regularly
- TOPMed panel may be updated
- Our ETL pipeline improves (allele matching, normalization)
- Re-scoring with updated data may change results

### What to Track

Every result stores `calculatedAt` (already implemented). The report should show:

```
Report Generated: April 1, 2026
PGS Catalog Data: March 28, 2026 (648 traits, 5,156 PGS)
Normalization: TOPMed r2 (93.1% avg AF coverage)
Imputation Panel: TOPMed (if applicable)
```

### Re-scoring Notifications

When the pipeline is updated (new traits, better normalization, more PGS):

- Public app: Shows "Updated data available — re-score your traits" banner
- Imputed users: Email notification "Your report has been updated with 12 new traits"
- Self-hosted: `pnpm scores calc all` skips existing, user runs manually

### Version Comparison

Future feature: show how scores changed between pipeline versions.

```
BMI: 78th %ile (was 72nd in v1.0)
  ↑ Improved: 3 new PGS added, better normalization
```

## Cross-Individual Report

For families, a comparison report:

```
Page 1: Family Overview
  - All members' radar charts overlaid
  - "Your family tends toward elevated metabolic traits"

Page 2: Trait-by-Trait Comparison
  - Table: trait × individual, color-coded percentiles
  - Highlights where family members diverge most

Page 3: Shared Genetics
  - Variants that appear in multiple family members' top contributors
  - "All three of you carry the T2D risk variant at 15:56580728"
```

## Implementation Priority

| Feature                       | Complexity | Revenue Impact               | v1.0?       |
| ----------------------------- | ---------- | ---------------------------- | ----------- |
| Category radar chart          | Medium     | High (visual hook)           | ✅ Yes      |
| Print-friendly report page    | Medium     | High (consultation use case) | ✅ Yes      |
| Summary teaser (public)       | Low        | Medium (upsell driver)       | ✅ Yes      |
| Full report (post-imputation) | Medium     | High (justifies $7.99)       | ✅ Yes      |
| Temporal tracking             | Low        | Low (already stored)         | ✅ Yes      |
| Family comparison report      | High       | Medium                       | Post-launch |
| Version comparison            | High       | Low                          | Post-launch |
| Re-scoring notifications      | Medium     | Medium                       | Post-launch |
