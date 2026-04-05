# Trait Presentation: Beyond the Percentile

## The Problem

The scoring pipeline produces rich per-PGS data — chromosome coverage maps, top contributing variants with cross-individual genotypes, positive/negative weight breakdowns, quality score components — but the UI collapses everything to a single percentile number. Once a user sees "78th percentile" and compares across family members, the trail goes cold.

## Data Already Available (per trait result)

From a single scored trait, we have:

### Trait Level

- z-score, percentile, confidence
- Best PGS ID and its quality score
- Total matched vs expected variants
- Predicted quantitative value (when applicable)

### Per PGS (multiple PGS per trait, ranked by quality)

- Raw score, z-score, percentile
- Matched / expected / genotyped / imputed variant counts
- R² (validated predictive accuracy)
- Quality score with component breakdown
- Chromosome coverage map (matched per chr vs total per chr)
- Positive/negative contribution split
- Weight distribution histogram

### Per Variant (top 20 per PGS)

- Variant ID (chr:pos:ref:alt)
- Effect allele and weight
- User's genotype and dosage
- Contribution to score (weight × dosage)
- Whether imputed or genotyped
- **Other family members' genotypes at the same position**

## Presentation Ideas

### 1. Family Comparison View

**What**: Side-by-side percentile bars for all family members on the same trait.

**Why it's interesting**: "Dad is 92nd percentile for BMI, Mom is 45th, I'm 78th — I got more from Dad's side." This is the core family genomics value prop.

**Data needed**: Already have it — just query all individuals' results for the same trait.

```
⚖️ Body Mass Index
┌──────────────────────────────────┐
│ 🧔 Ethan    ████████░░  78%ile  │
│ 👩 Lisa     ████░░░░░░  45%ile  │
│ 👦 James    ██████░░░░  62%ile  │
└──────────────────────────────────┘
```

### 2. Chromosome Heatmap

**What**: Visual map of which chromosomes contribute most to the score, with coverage overlay.

**Why it's interesting**: "Most of your BMI signal comes from chromosomes 2, 6, and 16" — gives a spatial sense of where in the genome the trait lives.

**Data needed**: `chromosome_coverage` (matched per chr) and `chr_totals` (total per chr) already stored per PGS.

```
Chr  Coverage  Contribution
 1   ████████  ██░░░░░░  moderate
 2   ████████  ████████  strong positive
 3   ███████░  █░░░░░░░  weak
 ...
16   ████████  ██████░░  strong negative
```

### 3. Variant Spotlight

**What**: Expandable list of the top contributing variants with plain-language explanations.

**Why it's interesting**: "Your strongest variant for T2D risk is at position 15:56580728 — you carry the C allele (dosage 1.98), which increases your score. Lisa also carries this variant."

**Data needed**: `top_variants` array with `otherGenotypes` — already stored.

```
🔬 Top Contributing Variants

#1  15:56580728 C>T
    Your genotype: TC (heterozygous)
    Contribution: +0.024 (risk-increasing)
    👩 Lisa: TC (same)  🧔 James: —

#2  16:55466500 A>G
    Your genotype: GA (heterozygous)
    Contribution: +0.019 (risk-increasing)
    👩 Lisa: GA (same)  🧔 James: GA (same)

#3  19:19296909 C>T
    Your genotype: TC (heterozygous)
    Contribution: -0.014 (protective)
    👩 Lisa: TC (same)  🧔 James: TC (same)
```

### 4. Risk vs Protective Balance

**What**: Visual showing the tug-of-war between risk-increasing and protective variants.

**Why it's interesting**: "You have 264K risk variants and 267K protective variants — they nearly cancel out, putting you close to average." Or: "Your protective variants are losing — 60% of your score comes from the risk side."

**Data needed**: `positive_variants`, `positive_sum`, `negative_variants`, `negative_sum` — already stored per PGS.

```
Risk Balance
├── 264,579 risk variants    → +6.37
├── 266,701 protective       → -6.04
└── Net: +0.33 (slightly elevated)

[████████████████░░░░░░░░░░░░░░░░]
 ← protective    neutral    risk →
```

### 5. PGS Comparison Table

**What**: Show how different PGS for the same trait agree or disagree.

**Why it's interesting**: "3 out of 5 validated PGS agree you're above average for this trait — that's a consistent signal." Or: "The PGS disagree — your result is uncertain."

**Data needed**: All PGS results for the trait — already stored. Quality score breakdown shows why one was chosen over others.

```
PGS Comparison for Type 2 Diabetes
┌────────────┬───────┬────────┬──────────┬─────────┐
│ PGS        │ R²    │ z-score│ Coverage │ Quality │
├────────────┼───────┼────────┼──────────┼─────────┤
│ PGS004887★ │ 9.2%  │ +3.01  │ 92.1%    │ 40.6    │
│ PGS002780  │ 8.6%  │ -4.17  │ 95.1%    │ 40.4    │
│ PGS003102  │ 8.1%  │ -3.31  │ 93.4%    │ 39.9    │
└────────────┴───────┴────────┴──────────┴─────────┘
⚠️ PGS disagree on direction — result confidence is lower
```

### 6. Shared Variants Across Traits

**What**: When the same variant appears in top variants for multiple traits, highlight the connection.

**Why it's interesting**: "This variant at 13:80143021 affects both your T2D risk and your BMI — these traits share genetic architecture."

**Data needed**: Cross-reference top_variants across traits. Not currently pre-computed but could be done client-side from cached results.

### 7. Coverage Quality Indicator

**What**: Visual showing what percentage of the PGS the user's DNA actually covers, with imputation upsell.

**Why it's interesting**: For public app users with 3% coverage, this is the "why you should impute" story. For imputed users, it validates the investment.

**Data needed**: `matched_variants / expected_variants` — already stored.

```
Your DNA Coverage for this PGS
[██░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 3.2%
Only 3.2% of variants matched. Impute for 92%+ coverage →

After imputation:
[████████████████████████████░░░░] 92.1%
✓ 1,029,805 of 1,117,622 variants matched
  └── 0 genotyped, 1,029,805 imputed
```

### 8. Trait Connections / Related Traits

**What**: Show which other traits share PGS or have correlated scores.

**Why it's interesting**: "Your high BMI score correlates with your elevated T2D risk — these traits are genetically linked." Helps users understand that traits aren't independent.

**Data needed**: PGS overlap between traits (from trait_pgs table) + score correlation across individuals. Could be pre-computed during ETL.

## What's Feasible for v1.0

| Feature                       | Data Ready?              | Complexity | v1.0?       |
| ----------------------------- | ------------------------ | ---------- | ----------- |
| Family comparison             | ✅ Yes                   | Low        | ✅ Yes      |
| Chromosome heatmap            | ✅ Yes                   | Medium     | ✅ Yes      |
| Variant spotlight             | ✅ Yes                   | Medium     | ✅ Yes      |
| Risk/protective balance       | ✅ Yes                   | Low        | ✅ Yes      |
| PGS comparison table          | ✅ Yes                   | Low        | ✅ Yes      |
| Shared variants across traits | ⚠️ Needs cross-query     | Medium     | Maybe       |
| Coverage quality              | ✅ Yes                   | Low        | ✅ Yes      |
| Trait connections             | ⚠️ Needs pre-computation | High       | Post-launch |

## The Trail That Doesn't End

The key insight: each level of detail opens a door to the next.

```
Trait Grid (44 cards with percentiles)
  → Trait Detail (family comparison, percentile viz)
    → PGS Breakdown (which PGS, why this one won)
      → Variant Spotlight (top 20 variants, family genotypes)
        → Chromosome View (where in the genome)
          → Cross-Trait Connections (shared genetic architecture)
```

Each step is a deeper dive that rewards curiosity without overwhelming on first view. The trait card shows the headline. Clicking reveals the story. The story has chapters.
