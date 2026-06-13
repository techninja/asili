/**
 * Peer state — manages remote viewing session.
 * When active, the beta view fetches data from DataChannel instead of IndexedDB.
 * @module utils/peer-state
 */

import { isConnected, onData, closeViewer } from './peer-rtc.js';
import { request } from './peer-protocol.js';

/** @type {boolean} */
let viewing = false;

// Restore viewing state from sessionStorage (survives in-page nav, not the connection)
const SESSION_KEY = 'asili-peer-viewing';
if (sessionStorage.getItem(SESSION_KEY)) {
  viewing = true;
}

/** @type {Array} cached individuals from remote */
let remoteIndividuals = [];

/** @type {Record<string, object>} cached results keyed by traitId */
let remoteResults = {};

/** @type {Set<Function>} */
const disconnectListeners = new Set();

/** Start remote viewing mode. */
export function enterViewerMode() {
  viewing = true;
  sessionStorage.setItem(SESSION_KEY, '1');
  onData((msg) => {
    if (msg.type === '_disconnected') exitViewerMode();
  });
}

/** Exit remote viewing mode and clean up. */
export function exitViewerMode() {
  viewing = false;
  sessionStorage.removeItem(SESSION_KEY);
  remoteIndividuals = [];
  remoteResults = {};
  resultCache.clear();
  closeViewer();
  for (const fn of disconnectListeners) fn();
}

/** @returns {boolean} whether we're actively connected and viewing */
export function isViewing() {
  return viewing && isConnected();
}

/** @returns {boolean} whether we were viewing before a refresh (connection lost) */
export function wasViewing() {
  return viewing && !isConnected();
}

/** Subscribe to disconnect event. */
export function onDisconnect(fn) {
  disconnectListeners.add(fn);
  return () => disconnectListeners.delete(fn);
}

/** Fetch individuals list from source device. */
export async function getIndividuals() {
  if (remoteIndividuals.length) return remoteIndividuals;
  remoteIndividuals = await request({ type: 'get-individuals' });
  return remoteIndividuals;
}

/** @type {Map<string, Record<string, object>>} cached results per individual */
const resultCache = new Map();

/** Fetch all results for an individual from source device. */
export async function getResults(individualId) {
  // Return from cache if available
  if (resultCache.has(individualId)) {
    remoteResults = resultCache.get(individualId);
    return remoteResults;
  }
  const data = await request({ type: 'get-results', individualId });
  remoteResults = {};
  for (const r of data || []) {
    if (r?.traitId) remoteResults[r.traitId] = r;
  }
  resultCache.set(individualId, remoteResults);
  return remoteResults;
}

/** Get a single cached remote result. */
export function getResult(traitId) {
  return remoteResults[traitId];
}

/** @returns {number} */
export function resultCount() {
  return Object.keys(remoteResults).length;
}
