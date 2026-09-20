/**
 * i18n initialization — registers Hybrids localize messages under 'en'.
 *
 * Why 'en' not 'default':
 *   localize('default', ...) sets dictionary.size > 0 globally, which makes
 *   Hybrids warn for every template string not in the dictionary — including
 *   all bare html`...` text. Using 'en' means only English users hit this
 *   bucket; other languages only have warnings if their locale file is
 *   incomplete, which is the correct behaviour.
 *
 * What belongs here:
 *   - All msg`...` tagged strings (looked up at runtime, not compile time)
 *   - Plural-form entries
 *   Static html`<span>Settings</span>` text does NOT need an entry — Hybrids
 *   falls back to the key itself when no translation matches.
 *
 * @module utils/i18n-init
 */

import { localize } from 'hybrids';

localize('en', {
  // --- plural forms ---
  '${0} traits scored': {
    message: { one: '${0} trait scored', other: '${0} traits scored' },
  },
  '${0} failed': {
    message: { one: '${0} failed', other: '${0} failed' },
  },
  '${0} imputed file${0} needed to continue': {
    message: {
      one: '${0} imputed file needs to continue',
      other: '${0} imputed files needed to continue',
    },
  },
  'Select file${0}': {
    message: { one: 'Select file', other: 'Select files' },
  },
  '${0} trait${0} failed': {
    message: { one: '${0} trait failed', other: '${0} traits failed' },
  },
  '${0} imputed file${0} need${0} access': {
    message: {
      one: '${0} imputed file needs access',
      other: '${0} imputed files need access',
    },
  },
  '${0} trait${0} at ${1}-${2}% coverage': {
    message: {
      one: '${0} trait at ${1}-${2}% coverage',
      other: '${0} traits at ${1}-${2}% coverage',
    },
  },
  '${0} individual${1}': {
    message: { one: '${0} individual', other: '${0} individuals' },
  },
  '${0} result${1}': {
    message: { one: '${0} result', other: '${0} results' },
  },
  '${0} variant set${1}': {
    message: { one: '${0} variant set', other: '${0} variant sets' },
  },

  // --- msg`...` strings (runtime lookups, not auto-translated by template compiler) ---
  'Add individual': { message: 'Add individual' },
  'Avg Coverage': { message: 'Avg Coverage' },
  'Avg Quality': { message: 'Avg Quality' },
  'Body Mass Index': { message: 'Body Mass Index' },
  'Browse results, compare family members, print reports': {
    message: 'Browse results, compare family members, print reports',
  },
  Category: { message: 'Category' },
  Chronotype: { message: 'Chronotype' },
  'Cognitive Ability': { message: 'Cognitive Ability' },
  'Coffee Consumption': { message: 'Coffee Consumption' },
  'Data Source': { message: 'Data Source' },
  'Drop your DNA file from 23andMe, AncestryDNA, or others': {
    message: 'Drop your DNA file from 23andMe, AncestryDNA, or others',
  },
  'DuckDB WASM scores variants against published research': {
    message: 'DuckDB WASM scores variants against published research',
  },
  Explore: { message: 'Explore' },
  Genes: { message: 'Genes' },
  'Genetic absorption tendency': { message: 'Genetic absorption tendency' },
  'Genetic cognitive baseline': { message: 'Genetic cognitive baseline' },
  'Genetic weight tendency': { message: 'Genetic weight tendency' },
  Height: { message: 'Height' },
  'How much is in your genes?': { message: 'How much is in your genes?' },
  Imputed: { message: 'Imputed' },
  'Loading DNA\u2026': { message: 'Loading DNA\u2026' },
  'Loading DNA\u2026 ${0}%': { message: 'Loading DNA\u2026 ${0}%' },
  'Male Pattern Baldness': { message: 'Male Pattern Baldness' },
  'Morning lark or night owl': { message: 'Morning lark or night owl' },
  Name: { message: 'Name' },
  Position: { message: 'Position' },
  'Predicted vs actual comparison': { message: 'Predicted vs actual comparison' },
  'Raw DNA': { message: 'Raw DNA' },
  Report: { message: 'Report' },
  Rescore: { message: 'Rescore' },
  'Rescore all individuals': { message: 'Rescore all individuals' },
  'Resting Heart Rate': { message: 'Resting Heart Rate' },
  'Search genes (BRCA1, APOE, dopamine...)': {
    message: 'Search genes (BRCA1, APOE, dopamine...)',
  },
  Studies: { message: 'Studies' },
  Table: { message: 'Table' },
  'Throughput:': { message: 'Throughput:' },
  'Toggle sort direction': { message: 'Toggle sort direction' },
  Traits: { message: 'Traits' },
  'Traits Scored': { message: 'Traits Scored' },
  'Traits:': { message: 'Traits:' },
  Upload: { message: 'Upload' },
  'Vitamin D': { message: 'Vitamin D' },
  'What does your DNA predict?': { message: 'What does your DNA predict?' },
  'Your cardiovascular genetics': { message: 'Your cardiovascular genetics' },
  '${0} done \u00b7 ${1} failed \u00b7 ${2} pending': {
    message: '${0} done \u00b7 ${1} failed \u00b7 ${2} pending',
  },
  '${0} variants/sec': { message: '${0} variants/sec' },
  '${0} var/s': { message: '${0} var/s' },
  ' \u00b7 ${0} err': { message: ' \u00b7 ${0} err' },
  ' \u00b7 ${0} scanned': { message: ' \u00b7 ${0} scanned' },
  '${0} MB stored (${1}, ${2}, ${3})': { message: '${0} MB stored (${1}, ${2}, ${3})' },
  '${0}/${1} traits': { message: '${0}/${1} traits' },
});
