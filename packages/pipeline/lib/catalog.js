/**
 * Load tier allowlists for trait filtering.
 * Returns null (no filtering) for wildcard or missing lists.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWLISTS_DIR = join(__dirname, '..', '..', '..', 'allowlists');

/**
 * @param {string} tier - e.g. 'tier1_public', 'tier2_researcher'
 * @returns {Set<string> | null} Set of trait IDs, or null for no filtering
 */
export function loadAllowlist(tier) {
  if (!tier || tier === 'local') return null;
  try {
    const data = JSON.parse(readFileSync(join(ALLOWLISTS_DIR, `${tier}.json`), 'utf8'));
    if (data.traits.includes('*')) return null;
    return new Set(data.traits);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
