/**
 * Trait pack fetching — Range requests, tar parsing, retry, throttle.
 * @module utils/score-fetch
 */

import { registerBuffer, dropFile } from '/packages/core/src/duckdb/adapter.js';
import { trackTransfer } from '#utils/transfer-tracker.js';
import { getScoringSettings } from '#utils/queue-settings.js';
import { S, notify } from '#utils/queue-state.js';

/** Stream a response body, tracking bytes. Returns ArrayBuffer. */
async function streamToBuffer(resp) {
  if (!resp.body) { const b = await resp.arrayBuffer(); trackTransfer(b.byteLength); return b; }
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    trackTransfer(value.byteLength);
  }
  const combined = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { combined.set(c, off); off += c.byteLength; }
  return combined.buffer;
}

/** Fetch a byte range with retry on transient errors. */
async function fetchRange(url, start, end, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
      if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`);
      return await streamToBuffer(resp);
    } catch (e) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else throw e;
    }
  }
}

/** Hop through tar headers via Range requests to build file index. */
async function fetchTarIndex(url) {
  const first = await fetch(url, { headers: { Range: 'bytes=0-511' } });
  if (first.status !== 206) return null;
  const hdr = new Uint8Array(await first.arrayBuffer());
  const dec = new TextDecoder();
  const mSize = parseInt(dec.decode(hdr.subarray(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
  const entries = [];
  let off = 512 + Math.ceil(mSize / 512) * 512;
  while (true) {
    const r = await fetch(url, { headers: { Range: `bytes=${off}-${off + 511}` } });
    if (r.status !== 206) break;
    const h = new Uint8Array(await r.arrayBuffer());
    const name = dec.decode(h.subarray(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const size = parseInt(dec.decode(h.subarray(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
    entries.push({ name, offset: off + 512, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/**
 * Fetch .asili trait pack — per-chromosome Range requests with throttle.
 * Falls back to full download if Range isn't supported.
 * @param {string} url @param {string} traitId
 * @returns {Promise<{chrMap: Map<string, string>, cleanup: Function}>}
 */
export async function loadTraitPack(url, traitId) {
  const entries = await fetchTarIndex(url);
  if (!entries) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    return loadFull(traitId, await streamToBuffer(resp));
  }
  const chrEntries = entries.filter((e) => e.name.endsWith('.parquet'));
  const chrMap = new Map();
  const names = [];
  const prefix = `t_${traitId}_`;
  const { bandwidthLimit } = await getScoringSettings();
  const limitBps = bandwidthLimit > 0 ? (bandwidthLimit * 1_000_000) / 8 : 0;

  for (let i = 0; i < chrEntries.length; i++) {
    const e = chrEntries[i];
    const chrNum = e.name.match(/chr(\d+)/)?.[1] || e.name.replace(/[^0-9]/g, '');
    S.currentChrDone = i;
    S.currentChrTotal = chrEntries.length;
    S.subProgress = i / chrEntries.length;
    notify();
    const t0 = performance.now();
    const buf = await fetchRange(url, e.offset, e.offset + e.size - 1);
    if (limitBps > 0) {
      const sleep = (buf.byteLength / limitBps) * 1000 - (performance.now() - t0);
      if (sleep > 50) await new Promise((r) => setTimeout(r, sleep));
    }
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, buf);
    chrMap.set(chrNum, regName);
    names.push(regName);
  }
  const cleanup = async () => { for (const n of names) await dropFile(n); };
  return { chrMap, cleanup };
}

/** Fallback: register all chr parquets from a fully-downloaded tar buffer. */
async function loadFull(traitId, tarBuf) {
  const entries = parseTarBuffer(tarBuf);
  const chrMap = new Map();
  const names = [];
  const prefix = `t_${traitId}_`;
  for (const e of entries) {
    if (!e.name.endsWith('.parquet') || e.size < 100) continue;
    const chrNum = e.name.match(/chr(\d+)/)?.[1] || e.name.replace(/[^0-9]/g, '');
    const regName = `${prefix}${e.name}`;
    await registerBuffer(regName, tarBuf.slice(e.offset, e.offset + e.size));
    chrMap.set(chrNum, regName);
    names.push(regName);
  }
  const cleanup = async () => { for (const n of names) await dropFile(n); };
  return { chrMap, cleanup };
}

/** @param {ArrayBuffer} buf */
function parseTarBuffer(buf) {
  const dec = new TextDecoder();
  const bytes = new Uint8Array(buf);
  const entries = [];
  let off = 0;
  while (off + 512 <= bytes.length) {
    const h = bytes.slice(off, off + 512);
    const name = dec.decode(h.slice(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const size = parseInt(dec.decode(h.slice(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
    entries.push({ name, offset: off + 512, size });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/** @param {File} file */
export async function parseTar(file) {
  const buf = await file.arrayBuffer();
  return parseTarBuffer(buf);
}
