/**
 * Minimal tar parser for .asili archives.
 * Extracts file entries as {name, offset, size} without reading data.
 * @module utils/tar-parser
 */

const HEADER_SIZE = 512;

/**
 * Parse tar headers from a File, returning entry metadata.
 * Does not read file data — callers use File.slice() for zero-copy access.
 * @param {File} file
 * @returns {Promise<Array<{name: string, offset: number, size: number}>>}
 */
export async function parseTarEntries(file) {
  const decoder = new TextDecoder();
  const entries = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= file.size) {
    const hdrBuf = await file.slice(offset, offset + HEADER_SIZE).arrayBuffer();
    const hdr = new Uint8Array(hdrBuf);
    const name = decoder.decode(hdr.slice(0, 100)).replace(/\0/g, '').trim();
    if (!name) break;
    const sizeStr = decoder.decode(hdr.slice(124, 136)).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const dataOffset = offset + HEADER_SIZE;

    entries.push({ name, offset: dataOffset, size });
    offset = dataOffset + Math.ceil(size / HEADER_SIZE) * HEADER_SIZE;
  }

  return entries;
}

/**
 * Read a specific entry from a tar File as text.
 * @param {File} file
 * @param {{offset: number, size: number}} entry
 * @returns {Promise<string>}
 */
export async function readTarEntryText(file, entry) {
  const blob = file.slice(entry.offset, entry.offset + entry.size);
  return blob.text();
}
