/**
 * .asili archive validator — checks manifest, file integrity, truncation.
 * @module utils/asili-validator
 */

/**
 * Validate a .asili tar archive. Returns manifest on success, error on failure.
 * @param {File} file
 * @returns {Promise<{ok: boolean, manifest?: object, error?: string, entries?: Array}>}
 */
export async function validateAsili(file) {
  if (file.size < 1024)
    return { ok: false, error: 'File too small — may be corrupted or truncated' };

  const entries = [];
  try {
    const dec = new TextDecoder();
    let off = 0;
    while (off + 512 <= file.size) {
      const h = new Uint8Array(await file.slice(off, off + 512).arrayBuffer());
      const name = dec.decode(h.slice(0, 100)).replace(/\0/g, '').trim();
      if (!name) break;
      const size = parseInt(dec.decode(h.slice(124, 136)).replace(/\0/g, '').trim(), 8) || 0;
      const dataEnd = off + 512 + size;
      if (dataEnd > file.size) {
        return {
          ok: false,
          error: `Truncated: "${name}" expects ${size} bytes but file ends early. Re-download recommended.`,
        };
      }
      entries.push({ name, offset: off + 512, size });
      off += 512 + Math.ceil(size / 512) * 512;
    }
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Could not read archive — file may be corrupted' };
  }

  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  if (!manifestEntry)
    return { ok: false, error: 'No manifest.json found — not a valid .asili file' };

  let manifest;
  try {
    const text = await file
      .slice(manifestEntry.offset, manifestEntry.offset + manifestEntry.size)
      .text();
    manifest = JSON.parse(text);
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'manifest.json is corrupted — re-download recommended' };
  }

  if (manifest.format !== 'asili-unified-v1') {
    return {
      ok: false,
      error: `Unknown format "${manifest.format}" — update the app or re-download`,
    };
  }

  const chrEntries = entries.filter((e) => e.name.endsWith('.parquet'));
  const expectedChrs = manifest.chromosomes ? Object.keys(manifest.chromosomes) : [];
  for (const chr of expectedChrs) {
    const expected = manifest.chromosomes[chr];
    const found = chrEntries.find((e) => e.name === expected.file);
    if (!found) {
      return {
        ok: false,
        error: `Missing ${expected.file} — archive is incomplete. Re-download recommended.`,
      };
    }
  }

  if (chrEntries.length === 0) {
    return { ok: false, error: 'No chromosome data found in archive' };
  }

  return { ok: true, manifest, entries };
}
