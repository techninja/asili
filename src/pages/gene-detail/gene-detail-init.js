/**
 * Gene detail data loading — init and individual switching.
 * @module pages/gene-detail/gene-detail-init
 */

import { loadGeneCatalog } from '#utils/gene-catalog.js';
import { getActiveId, loadResults } from '#pages/beta/results-store.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { loadProfile } from '#utils/individual-profile.js';

/** Load gene data and cross-reference user variants. */
export async function initGeneView(host) {
  if (!host.symbol) return;

  const id = getActiveId();
  host.activeId = id;

  // Load gene from catalog
  const catalog = await loadGeneCatalog();
  const gene = catalog.genes.find((g) => g.symbol === host.symbol);
  const idx = catalog.genes.indexOf(gene);
  host.prevGene = idx > 0 ? catalog.genes[idx - 1].symbol : '';
  host.nextGene = idx < catalog.genes.length - 1 ? catalog.genes[idx + 1].symbol : '';
  host.gene = gene || {};

  if (!gene) return;

  // Set page title
  document.title = `Asili | ${gene.emoji || '🧬'} ${gene.symbol} 2014 ${gene.name}`;

  // Load individual data
  if (!id) {
    host.isImputed = false;
    host.variantHits = [];
    host.variantCount = 0;
    host.dr2Bins = {};
    host.geneStats = {};
    return;
  }

  try {
    await idb.openDB();
    const ind = await idb.get('individuals', id);
    host.indEmoji = ind?.emoji || '🧬';
    host.indName = ind?.name || '';
    host.isImputed = !!ind?.hasImputed;

    // Load DR2 quality bins for imputed individuals
    const profile = (await loadProfile(id)) || {};
    host.dr2Bins = profile || {};
    host.geneStats = profile?.geneStats?.[gene.symbol] || {};

    if (host.isImputed) {
      host.variantHits = gene.popular_variants || [];
      host.variantCount = ind?.variantCount || 0;
      return;
    }

    // For raw users: check if popular variants exist in their data
    const variantData = await idb.get('variants', id);
    if (variantData?.variants?.length && gene.popular_variants.length) {
      const userRsids = new Set(variantData.variants.map((v) => v.rsid));
      host.variantHits = gene.popular_variants.filter((rs) => userRsids.has(rs));
      host.variantCount = variantData.variants.length;
    } else {
      host.variantHits = [];
      host.variantCount = variantData?.variants?.length || 0;
    }
  } catch {
    host.isImputed = false;
    host.variantHits = [];
    host.variantCount = 0;
  }
}

/** @param {object & HTMLElement} host @param {CustomEvent} e */
export async function handleSwitch(host, e) {
  const id = e.detail;
  host.activeId = id;
  await loadResults(id);
  await initGeneView(host);
}
