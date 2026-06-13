/**
 * Peer RTC — WebRTC connections for QR-based offer/answer exchange.
 * Source: supports multiple viewers (one PC per viewer).
 * Viewer: single connection to source.
 * @module utils/peer-rtc
 */

import {
  ICE_CONFIG,
  compress,
  decompress,
  dcListeners,
  openListeners,
  emit,
  emitOpen,
  waitForICE,
} from './peer-rtc-shared.js';

// --- Source side: multiple connections ---
/** @type {Map<string, { pc: RTCPeerConnection, dc: RTCDataChannel }>} */
const sourceConns = new Map();
/** @type {{ pc: RTCPeerConnection, dc: RTCDataChannel|null, offer: string }|null} */
let pendingSource = null;

// --- Viewer side: single connection ---
/** @type {RTCPeerConnection|null} */
let viewerPc = null;
/** @type {RTCDataChannel|null} */
let viewerDc = null;

// --- Public API: listeners ---
/** Subscribe to DataChannel messages (from any connection). */
export function onData(fn) {
  dcListeners.add(fn);
  return () => dcListeners.delete(fn);
}

/** Subscribe to DataChannel open. Only fires on NEW channel opens. */
export function onOpen(fn) {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}

// --- Source API ---

/** Source: create a new offer for a viewer. Returns compressed offer string. */
export async function createOffer() {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  const dc = pc.createDataChannel('asili');
  const id = crypto.randomUUID();

  dc.onopen = () => {
    sourceConns.set(id, { pc, dc });
    pendingSource = null;
    emitOpen();
  };
  dc.onmessage = (e) => emit(JSON.parse(e.data));
  dc.onclose = () => {
    sourceConns.delete(id);
    emit({ type: '_disconnected', connId: id });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForICE(pc);

  const compressed = compress(pc.localDescription);
  pendingSource = { pc, dc: null, offer: compressed };
  return compressed;
}

/** Source: accept a compressed answer for the pending offer. */
export async function acceptAnswer(compressedAnswer) {
  if (!pendingSource) throw new Error('No pending offer');
  await pendingSource.pc.setRemoteDescription(decompress(compressedAnswer));
}

/** Source: send a message to all connected viewers. */
export function sendToAll(msg) {
  const json = JSON.stringify(msg);
  for (const { dc } of sourceConns.values()) {
    if (dc.readyState === 'open') dc.send(json);
  }
}

/** @returns {number} */
export function viewerCount() {
  return sourceConns.size;
}

/** Close all source connections and clear listeners. */
export function closeAllSource() {
  for (const { pc, dc } of sourceConns.values()) {
    dc.close();
    pc.close();
  }
  sourceConns.clear();
  if (pendingSource) {
    pendingSource.pc.close();
    pendingSource = null;
  }
  openListeners.clear();
  dcListeners.clear();
}

// --- Viewer API ---

/** Viewer: accept a compressed offer, return compressed answer. */
export async function acceptOffer(compressedOffer) {
  viewerPc = new RTCPeerConnection(ICE_CONFIG);
  viewerPc.ondatachannel = (e) => {
    viewerDc = e.channel;
    viewerDc.onopen = () => emitOpen();
    viewerDc.onmessage = (ev) => emit(JSON.parse(ev.data));
    viewerDc.onclose = () => emit({ type: '_disconnected' });
  };
  await viewerPc.setRemoteDescription(decompress(compressedOffer));
  const answer = await viewerPc.createAnswer();
  await viewerPc.setLocalDescription(answer);
  await waitForICE(viewerPc);
  return compress(viewerPc.localDescription);
}

/** Viewer: close the connection. */
export function closeViewer() {
  viewerDc?.close();
  viewerPc?.close();
  viewerDc = null;
  viewerPc = null;
}

// --- Shared ---

/** Send a message (viewer → source, or source → all viewers). */
export function send(msg) {
  if (viewerDc?.readyState === 'open') {
    viewerDc.send(JSON.stringify(msg));
    return;
  }
  sendToAll(msg);
}

/** Close everything (full reset). */
export function close() {
  closeViewer();
  closeAllSource();
}

/** @returns {boolean} true if any DataChannel is open. */
export function isConnected() {
  if (viewerDc?.readyState === 'open') return true;
  for (const { dc } of sourceConns.values()) if (dc.readyState === 'open') return true;
  return false;
}
