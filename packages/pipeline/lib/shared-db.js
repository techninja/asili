/**
 * Singleton SQLite connection to trait_manifest.db.
 * All pipeline DB access goes through here.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR =
  process.env.OUTPUT_DIR || join(__dirname, '..', '..', '..', 'data_out');
const DB_PATH = join(OUTPUT_DIR, 'trait_manifest.db');

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

/** @type {Database.Database | null} */
let db = null;

/** @returns {Database.Database} */
export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 *
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export { DB_PATH, OUTPUT_DIR };
