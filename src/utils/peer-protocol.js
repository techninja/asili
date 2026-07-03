/**
 * Peer protocol — request/response over WebRTC DataChannel.
 * Source: serves data from IndexedDB to connected viewers.
 * Viewer: requests data and resolves promises.
 * @module utils/peer-protocol
 */

import { onData, send } from './peer-rtc.js';
import * as idb from '/packages/core/src/data-layer/idb.js';

/** @type {Map<string, Function>} pending request callbacks keyed by reqId */
const pending = new Map();

/** Start serving data requests (call on source device). */
export function startServing() {
  onData(async (msg) => {
    if (msg.type === 'response') {
      resolvePending(msg);
      return;
    }
    await idb.openDB();
    let data;
    if (msg.type === 'get-individuals') {
      data = await idb.getAll('individuals');
    } else if (msg.type === 'get-results') {
      const prefix = `${msg.individualId}:`;
      const keys = await idb.getAllKeys('results');
      data = [];
      for (const k of keys) {
        if (String(k).startsWith(prefix)) {
          const r = await idb.get('results', k);
          if (r) data.push({ ...r, traitId: String(k).slice(prefix.length) });
        }
      }
    } else if (msg.type === 'get-trait-detail') {
      const r = await idb.get('results', `${msg.individualId}:${msg.traitId}`);
      data = r ? { ...r, traitId: msg.traitId } : null;
    }
    if (data !== undefined) {
      // Chunk large responses to avoid exceeding DataChannel max message size
      const payload = JSON.stringify({ type: 'response', reqId: msg.reqId, data });
      if (payload.length > 64000) {
        sendChunked(msg.reqId, data);
      } else {
        send({ type: 'response', reqId: msg.reqId, data });
      }
    }
  });
}

/** Send large data in chunks with reassembly on the viewer side. */
function sendChunked(reqId, data) {
  const json = JSON.stringify(data);
  const CHUNK_SIZE = 48000;
  const total = Math.ceil(json.length / CHUNK_SIZE);
  for (let i = 0; i < total; i++) {
    send({
      type: 'chunk',
      reqId,
      index: i,
      total,
      chunk: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    });
  }
}

/** Start listening for responses (call on viewer device). */
export function startViewing() {
  onData((msg) => {
    if (msg.type === 'response') resolvePending(msg);
    if (msg.type === 'chunk') handleChunk(msg);
  });
}

/** @type {Map<string, { chunks: string[], received: number, total: number }>} */
const chunkBuffers = new Map();

/**
 *
 */
function handleChunk(msg) {
  let buf = chunkBuffers.get(msg.reqId);
  if (!buf) {
    buf = { chunks: new Array(msg.total), received: 0, total: msg.total };
    chunkBuffers.set(msg.reqId, buf);
  }
  buf.chunks[msg.index] = msg.chunk;
  buf.received++;
  if (buf.received === buf.total) {
    chunkBuffers.delete(msg.reqId);
    const data = JSON.parse(buf.chunks.join(''));
    resolvePending({ reqId: msg.reqId, data });
  }
}

/**
 *
 */
function resolvePending(msg) {
  const cb = pending.get(msg.reqId);
  if (cb) {
    cb(msg.data);
    pending.delete(msg.reqId);
  }
}

/** Request data from the source. Returns a promise. */
export function request(msg, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID();
    pending.set(reqId, resolve);
    send({ ...msg, reqId });
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        reject(new Error('Timeout'));
      }
    }, timeoutMs);
  });
}
