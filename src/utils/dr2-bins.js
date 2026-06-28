/**
 * DR2 quality bins accessor — reads from individual profile in IDB.
 * @module utils/dr2-bins
 */
import { loadProfile } from './individual-profile.js';

/**
 * Load stored DR2 bins for an individual.
 * @param {string} individualId
 * @returns {Promise<Record<string, number[]>|null>}
 */
export async function loadDR2Bins(individualId) {
  const profile = await loadProfile(individualId);
  return profile?.dr2Bins || null;
}
