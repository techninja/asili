/**
 * Sync helpers — shared file download logic.
 * @module scripts/sync-helpers
 */

import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export const state = { fetched: 0, skipped: 0 };

/** @param {number} bytes @returns {string} */
function fmtSize(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * @param {string} baseUrl
 * @param {string} remotePath
 * @param {string} localPath
 * @param {boolean} force
 */
export async function syncFile(baseUrl, remotePath, localPath, force) {
  if (!force && existsSync(localPath)) {
    state.skipped++;
    return;
  }
  const res = await fetch(`${baseUrl}/${remotePath}`);
  if (!res.ok) {
    console.warn(`  \u2717 ${remotePath} (${res.status})`);
    return;
  }
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
  console.log(`  \u2193 ${remotePath} (${fmtSize(statSync(localPath).size)})`);
  state.fetched++;
}
