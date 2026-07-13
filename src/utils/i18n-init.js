/**
 * i18n initialization — registers Hybrids localize messages for plural forms.
 * Must be imported before first component render.
 *
 * Static template text is auto-translated by Hybrids (no msg needed).
 * Only dynamic/plural strings that use `msg` need entries here.
 *
 * @module utils/i18n-init
 */

import { localize } from 'hybrids';

localize('default', {
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
  '${0}/${1} traits': {
    message: '${0}/${1} traits',
  },

  // --- hero showcase (msg-wrapped dynamic args) ---
  'Body Mass Index': { message: 'Body Mass Index' },
  'Genetic weight tendency': { message: 'Genetic weight tendency' },
  Height: { message: 'Height' },
  'Predicted vs actual comparison': { message: 'Predicted vs actual comparison' },
  'Coffee Consumption': { message: 'Coffee Consumption' },
  'How much is in your genes?': { message: 'How much is in your genes?' },
  Chronotype: { message: 'Chronotype' },
  'Morning lark or night owl': { message: 'Morning lark or night owl' },
  'Male Pattern Baldness': { message: 'Male Pattern Baldness' },
  'What does your DNA predict?': { message: 'What does your DNA predict?' },
  'Vitamin D': { message: 'Vitamin D' },
  'Genetic absorption tendency': { message: 'Genetic absorption tendency' },
  'Cognitive Ability': { message: 'Cognitive Ability' },
  'Genetic cognitive baseline': { message: 'Genetic cognitive baseline' },
  'Resting Heart Rate': { message: 'Resting Heart Rate' },
  'Your cardiovascular genetics': { message: 'Your cardiovascular genetics' },
  Upload: { message: 'Upload' },
  'Drop your DNA file from 23andMe, AncestryDNA, or others': {
    message: 'Drop your DNA file from 23andMe, AncestryDNA, or others',
  },
  Score: { message: 'Score' },
  'DuckDB WASM scores variants against published research': {
    message: 'DuckDB WASM scores variants against published research',
  },
  Explore: { message: 'Explore' },
  'Browse results, compare family members, print reports': {
    message: 'Browse results, compare family members, print reports',
  },

  // --- floating bar (msg-wrapped dynamic expressions) ---
  'Traits:': { message: 'Traits:' },
  '${0} done \u00b7 ${1} failed \u00b7 ${2} pending': {
    message: '${0} done \u00b7 ${1} failed \u00b7 ${2} pending',
  },
  'Throughput:': { message: 'Throughput:' },
  '${0} variants/sec': { message: '${0} variants/sec' },
  '${0} var/s': { message: '${0} var/s' },
  ' \u00b7 ${0} err': { message: ' \u00b7 ${0} err' },
  ' \u00b7 ${0} scanned': { message: ' \u00b7 ${0} scanned' },

  // --- tabs & tooltips (msg-wrapped dynamic expressions) ---
  Traits: { message: 'Traits' },
  Genes: { message: 'Genes' },
  Table: { message: 'Table' },
  Report: { message: 'Report' },
  'Toggle sort direction': { message: 'Toggle sort direction' },

  // --- scoring status ---
  'Loading DNA\u2026': { message: 'Loading DNA\u2026' },
  'Loading DNA\u2026 ${0}%': { message: 'Loading DNA\u2026 ${0}%' },

  // --- explore grid ---
  'Search genes (BRCA1, APOE, dopamine...)': { message: 'Search genes (BRCA1, APOE, dopamine...)' },
  Position: { message: 'Position' },
  Name: { message: 'Name' },
  Studies: { message: 'Studies' },
  Category: { message: 'Category' },

  // --- tooltips ---
  'Add individual': { message: 'Add individual' },
  Rescore: { message: 'Rescore' },
  'Rescore all individuals': { message: 'Rescore all individuals' },

  // --- report stats ---
  'Traits Scored': { message: 'Traits Scored' },
  'Avg Coverage': { message: 'Avg Coverage' },
  'Avg Quality': { message: 'Avg Quality' },
  'Data Source': { message: 'Data Source' },
  'Raw DNA': { message: 'Raw DNA' },
  Imputed: { message: 'Imputed' },

  // --- storage (plural) ---
  '${0} MB stored (${1}, ${2}, ${3})': {
    message: '${0} MB stored (${1}, ${2}, ${3})',
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
});
