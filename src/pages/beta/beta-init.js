/**
 * Beta view initialization — app startup, event listeners, rescore handling.
 * @module pages/beta/beta-init
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { loadResults, clearResults } from './results-store.js';
import { initQueue, switchIndividual } from './scoring-controller.js';
import { clearTransfer } from '#utils/transfer-tracker.js';

/** @param {object} host */
export async function initApp(host) {
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');

  // Migration: move global ancestry setting to per-individual
  const globalAncestry = localStorage.getItem('asili-ancestry') || localStorage.getItem('ancestry');
  if (globalAncestry && host.individuals.length > 0) {
    for (const ind of host.individuals) {
      if (!ind.ancestry) {
        await idb.put('individuals', ind.id, { ...ind, ancestry: globalAncestry });
      }
    }
    localStorage.removeItem('asili-ancestry');
    localStorage.removeItem('ancestry');
    host.individuals = await idb.getAll('individuals');
  }

  if (host.individuals.length > 0) {
    const id = host.activeId || host.individuals[0].id;
    host.activeId = id;
    host.resultCount = await loadResults(id);
    await initQueue(host);
  }
}

/** Connect handler for _init property. */
export function connectInit(host, _key, invalidate) {
  document.title = 'Asili | Polygenic Risk Scores';
  initApp(host).then(() => {
    invalidate();
    if (sessionStorage.getItem('asili-open-upload')) {
      sessionStorage.removeItem('asili-open-upload');
      host.showUpload = true;
    }
    requestAnimationFrame(() => {
      if (host.activeId) switchIndividual(host, host.activeId);
    });
  });
  const refresh = () => {
    idb.getAll('individuals').then((list) => {
      host.individuals = list;
    });
  };
  window.addEventListener('asili-individuals-changed', refresh);
  const rescore = async (e) => {
    const id = e.detail;
    await clearTransfer(id);
    if (id === host.activeId) {
      await clearResults();
      host.resultCount = 0;
      host.scoringStatus = '';
    } else {
      const dl = await import('/packages/core/src/data-layer/create.js').then((m) =>
        m.getDataLayer(),
      );
      await dl.clearResults(id);
    }
    await initQueue(host);
  };
  window.addEventListener('asili-rescore', rescore);
  return () => {
    window.removeEventListener('asili-individuals-changed', refresh);
    window.removeEventListener('asili-rescore', rescore);
  };
}
