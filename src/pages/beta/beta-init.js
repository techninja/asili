/**
 * Beta view initialization — app startup, event listeners, rescore handling.
 * @module pages/beta/beta-init
 */

import * as idb from '/packages/core/src/data-layer/idb.js';
import { loadResults, clearResults } from './results-store.js';
import { initQueue, switchIndividual } from './scoring-controller.js';
import { clearTransfer } from '#utils/transfer-tracker.js';
import { isViewing, wasViewing, getIndividuals, onDisconnect } from '#utils/peer-state.js';

/** @param {object} host */
export async function initApp(host) {
  // Remote viewer mode — fetch from DataChannel
  if (isViewing()) {
    await initRemoteViewer(host);
    return;
  }
  // Was viewing but connection died (page refresh) — show reconnect state
  if (wasViewing()) {
    host._remoteViewing = true;
    host._reconnect = true;
    return;
  }
  await idb.openDB();
  host.individuals = await idb.getAll('individuals');
  if (host.individuals.length > 0) {
    const id = host.activeId || host.individuals[0].id;
    host.activeId = id;
    host.resultCount = await loadResults(id);
    await initQueue(host);
  }
}

/** Load remote data for viewer mode. */
async function initRemoteViewer(host) {
  host._remoteViewing = true;
  const individuals = await getIndividuals();
  host.individuals = individuals;
  if (individuals.length > 0) {
    const id = host.activeId || individuals[0].id;
    host.activeId = id;
    host.resultCount = await loadResults(id);
  }
}

/** Connect handler for _init property. */
export function connectInit(host, _key, invalidate) {
  document.title = 'Asili | Polygenic Risk Scores';
  initApp(host).then(() => {
    invalidate();
    if (host._remoteViewing) return; // skip local-only setup for viewer mode
    if (sessionStorage.getItem('asili-open-upload')) {
      sessionStorage.removeItem('asili-open-upload');
      host.showUpload = true;
    }
    requestAnimationFrame(() => {
      if (host.activeId) switchIndividual(host, host.activeId);
    });
  });

  // Handle remote disconnect — reset to local state
  const unsubDisconnect = onDisconnect(() => {
    host._remoteViewing = false;
    host.individuals = [];
    host.activeId = '';
    host.resultCount = 0;
    initApp(host).then(invalidate);
  });

  const refresh = () => {
    if (host._remoteViewing) return;
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
    unsubDisconnect();
  };
}
