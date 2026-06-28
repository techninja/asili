/**
 * Settings drawer — rebuild profiles handler.
 * Handles both imputed (.asili via file handles + DuckDB) and raw (IDB variants) users.
 * @module components/organisms/settings-drawer/drawer-profiles
 */
import * as idb from '/packages/core/src/data-layer/idb.js';
import { restoreAll } from '#utils/file-handle.js';
import { initDuckDB, registerBuffer, closeDuckDB } from '/packages/core/src/duckdb/adapter.js';
import { loadUnifiedDNA, resetUnifiedDNA } from '/packages/core/src/duckdb/unified-source.js';
import { extractAndStoreProfile, storeRawProfile } from '#utils/individual-profile.js';
import { parseTar } from '#utils/score-fetch.js';
import { isDev } from '#utils/data-url.js';

/** @param {object} host */
export async function handleRebuildProfiles(host) {
  if (host.profileRebuilding) return;
  host.profileRebuilding = true;
  host.profileProgress = 0;

  try {
    await idb.openDB();
    const individuals = await idb.getAll('individuals');
    const total = individuals.length;
    if (!total) {
      host.profileRebuilding = false;
      return;
    }

    // Separate imputed vs raw
    const imputed = individuals.filter((i) => i.hasImputed);
    const raw = individuals.filter((i) => !i.hasImputed);
    let done = 0;

    // --- Raw users: build profile from IDB variants (no DuckDB needed) ---
    for (const ind of raw) {
      const stored = await idb.get('variants', ind.id);
      if (stored?.variants?.length) {
        await storeRawProfile(ind.id, stored.variants);
      }
      done++;
      host.profileProgress = done / total;
      console.log(`[profiles] ✅ ${ind.name || ind.id} (raw) done`);
    }

    // --- Imputed users: need file handles + DuckDB ---
    if (imputed.length) {
      const files = await restoreAll(true);

      if (files.size) {
        const duckdbBase = isDev
          ? `${window.location.origin}/deps/duckdb`
          : 'https://data.asili.dev/deps/duckdb';
        await initDuckDB(duckdbBase);

        for (const ind of imputed) {
          const file = files.get(ind.id);
          if (!file) {
            done++;
            host.profileProgress = done / total;
            continue;
          }

          console.log(`[profiles] Extracting profile for ${ind.name || ind.id}…`);
          await resetUnifiedDNA();

          const entries = await parseTar(file);
          const prefix = `prof_${Date.now()}_`;
          const parquets = entries.filter((e) => e.name.endsWith('.parquet'));

          for (const e of parquets) {
            const buf = await file.slice(e.offset, e.offset + e.size).arrayBuffer();
            await registerBuffer(prefix + e.name, buf);
          }

          await loadUnifiedDNA(parquets.map((e) => prefix + e.name));
          await extractAndStoreProfile(ind.id);
          await resetUnifiedDNA();

          done++;
          host.profileProgress = done / total;
          console.log(`[profiles] ✅ ${ind.name || ind.id} (imputed) done`);
        }

        await closeDuckDB();
      } else {
        done += imputed.length;
        host.profileProgress = done / total;
        console.log('[profiles] No imputed file handles available — skipped');
      }
    }

    console.log('[profiles] All profiles rebuilt');
  } catch (e) {
    console.error('[profiles] Rebuild failed:', e);
  } finally {
    host.profileRebuilding = false;
    host.profileProgress = 1;
  }
}
