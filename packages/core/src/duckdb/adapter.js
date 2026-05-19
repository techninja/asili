/**
 * DuckDB WASM browser adapter.
 * Initializes DuckDB, provides query interface with Arrow → plain object conversion.
 * @module packages/core/src/duckdb/adapter
 */

/** @type {object|null} */
let db = null;
/** @type {object|null} */
let conn = null;
/** @type {object|null} */
let duckdbModule = null;

/**
 * Initialize DuckDB WASM. Idempotent.
 * @param {string} [basePath] - Path to WASM/worker files
 * @returns {Promise<void>}
 */
export async function initDuckDB(basePath = '/deps/duckdb', opts = {}) {
  if (db) return;
  duckdbModule = await import(`${basePath}/duckdb.js`);
  const base = new URL(basePath, self.location?.origin || 'http://localhost').href;
  const bundle = await duckdbModule.selectBundle({
    mvp: { mainModule: `${base}/duckdb-mvp.wasm`, mainWorker: `${base}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${base}/duckdb-eh.wasm`, mainWorker: `${base}/duckdb-browser-eh.worker.js` },
  });
  const worker = await duckdbModule.createWorker(bundle.mainWorker);
  const logger = new duckdbModule.VoidLogger();
  db = new duckdbModule.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  const mem = opts.memoryLimit || '2GB';
  await conn.query(`SET memory_limit='${mem}'`);
  await conn.query("SET threads=1");
}

/**
 * Run a SQL query, return plain objects.
 * @param {string} sql
 * @returns {Promise<Array<object>>}
 */
export async function query(sql, timeoutMs = 120_000) {
  if (!conn) throw new Error('DuckDB not initialized');
  const result = await Promise.race([
    conn.query(sql),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DuckDB query timeout')), timeoutMs),
    ),
  ]);
  return result.toArray().map((row) => {
    const obj = {};
    for (const key of Object.keys(row)) obj[key] = row[key];
    return obj;
  });
}

/**
 * Count rows in a table or parquet URL.
 * @param {string} tableOrUrl
 * @returns {Promise<number>}
 */
export async function count(tableOrUrl) {
  const rows = await query(`SELECT COUNT(*) as cnt FROM '${tableOrUrl}'`);
  return Number(rows[0].cnt);
}

/**
 * Register a parquet file from an ArrayBuffer.
 * @param {string} name - Virtual filename
 * @param {ArrayBuffer} buffer
 * @returns {Promise<void>}
 */
export async function registerBuffer(name, buffer) {
  if (!db) throw new Error('DuckDB not initialized');
  await db.registerFileBuffer(name, new Uint8Array(buffer));
}

/**
 * Register a File handle for DuckDB to read on demand (no full memory copy).
 * Uses BROWSER_FILEREADER protocol for streaming reads.
 * @param {string} name - Virtual filename
 * @param {File} file - File object from input or drag-drop
 * @returns {Promise<void>}
 */
export async function registerFileHandle(name, file) {
  if (!db || !duckdbModule) throw new Error('DuckDB not initialized');
  await db.registerFileHandle(name, file, duckdbModule.DuckDBDataProtocol.BROWSER_FILEREADER, true);
}

/** @returns {boolean} */
export function isReady() { return !!conn; }

/** Drop a registered file by name. */
export async function dropFile(name) {
  if (!db) return;
  try { await db.dropFile(name); } catch (e) { console.warn('dropFile:', e.message); }
}

/** Shut down DuckDB. */
export async function closeDuckDB() {
  if (conn) { await conn.close(); conn = null; }
  if (db) { await db.terminate(); db = null; }
}
