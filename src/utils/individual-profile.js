/**
 * Individual profile extraction — caches per-individual metadata from DNA
 * chr parquets during the scoring session (the one guaranteed window where
 * DuckDB has the data registered).
 *
 * Profile data is stored in IDB `settings` under key `profile:{individualId}`.
 * @module utils/individual-profile
 */
import * as ddb from '/packages/core/src/duckdb/adapter.js';
import { getChrFiles } from '/packages/core/src/duckdb/unified-source.js';
import * as idb from '/packages/core/src/data-layer/idb.js';
import { extractGeneStats } from './profile-gene-stats.js';

const PROFILE_VERSION = 1;
const BIN_SIZE = 500_000; // 500kb windows for higher resolution strips

/**
 * Extract full profile from currently-registered DNA chr files.
 * @returns {Promise<object|null>}
 */
export async function extractProfile() {
  const chrFiles = getChrFiles();
  if (!chrFiles.length) return null;

  const dr2Bins = {};
  const regionCoverage = {};

  for (const f of chrFiles) {
    const chrNum = f.match(/chr([0-9XY]+)/i)?.[1] || '';
    if (!chrNum) continue;
    const ref = f.startsWith('_') ? f : `'${f}'`;

    try {
      const covRows = await ddb.query(`
        SELECT FLOOR(pos / ${BIN_SIZE})::INT AS bin, COUNT(*) AS cnt
        FROM ${ref} GROUP BY bin ORDER BY bin
      `);
      if (covRows.length) {
        const maxBin = Math.max(...covRows.map((r) => Number(r.bin)));
        const bins = new Array(maxBin + 1).fill(0);
        for (const r of covRows) bins[Number(r.bin)] = Number(r.cnt);
        regionCoverage[chrNum] = bins;
      }
    } catch {
      /* genotyped tables may differ */
    }

    try {
      const dr2Rows = await ddb.query(`
        SELECT FLOOR(pos / ${BIN_SIZE})::INT AS bin,
               COUNT(CASE WHEN NOT imputed THEN 1 END) AS genotyped,
               COUNT(CASE WHEN imputed AND imputation_quality >= 0.8 THEN 1 END) AS high,
               COUNT(CASE WHEN imputed AND imputation_quality >= 0.3 AND imputation_quality < 0.8 THEN 1 END) AS medium,
               COUNT(CASE WHEN imputed AND imputation_quality < 0.3 THEN 1 END) AS low,
               COUNT(*) AS total
        FROM ${ref}
        GROUP BY bin ORDER BY bin
      `);
      if (dr2Rows.length) {
        const maxBin = Math.max(...dr2Rows.map((r) => Number(r.bin)));
        const bins = new Array(maxBin + 1).fill(null);
        for (const r of dr2Rows) {
          const total = Number(r.total);
          bins[Number(r.bin)] = total ? (Number(r.genotyped) + Number(r.high)) / total : 0;
        }
        dr2Bins[chrNum] = bins;
      }
    } catch {
      /* column may not exist */
    }
  }

  const geneStats = await extractGeneStats(chrFiles);

  return {
    version: PROFILE_VERSION,
    extractedAt: new Date().toISOString(),
    dr2Bins,
    regionCoverage,
    geneStats,
  };
}

/**
 * Extract and persist profile for an individual.
 * @param {string} individualId
 */
export async function extractAndStoreProfile(individualId) {
  const profile = await extractProfile();
  if (!profile) return;
  await idb.openDB();
  await idb.put('settings', `profile:${individualId}`, profile);
}

/**
 * Load stored profile for an individual.
 * @param {string} individualId
 * @returns {Promise<object|null>}
 */
export async function loadProfile(individualId) {
  if (!individualId) return null;
  await idb.openDB();
  return idb.get('settings', `profile:${individualId}`);
}

/**
 * Check if a profile exists and is current version.
 * @param {string} individualId
 * @returns {Promise<boolean>}
 */
export async function hasCurrentProfile(individualId) {
  const p = await loadProfile(individualId);
  return p?.version === PROFILE_VERSION;
}

/**
 * Build and store a profile for a raw (genotyped) individual from IDB variants.
 * @param {string} individualId
 * @param {Array<{chromosome: string, position: number}>} variants
 */
export async function storeRawProfile(individualId, variants) {
  const regionCoverage = {};
  for (const v of variants) {
    const chr = String(v.chromosome);
    if (!regionCoverage[chr]) regionCoverage[chr] = [];
    const bin = Math.floor(v.position / BIN_SIZE);
    if (!regionCoverage[chr][bin]) regionCoverage[chr][bin] = 0;
    regionCoverage[chr][bin]++;
  }
  for (const chr of Object.keys(regionCoverage)) {
    const arr = regionCoverage[chr];
    for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = 0;
  }
  const profile = {
    version: PROFILE_VERSION,
    extractedAt: new Date().toISOString(),
    dr2Bins: {},
    regionCoverage,
  };
  await idb.openDB();
  await idb.put('settings', `profile:${individualId}`, profile);
}
