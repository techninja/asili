import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always use repo root data_out, regardless of where script is run from
const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data_out');
const DB_PATH = path.join(OUTPUT_DIR, 'trait_manifest.db');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  console.log(`Creating output directory: ${OUTPUT_DIR}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

class SharedDB {
  constructor() {
    this.db = null;
    this.conn = null;
    this.initialized = false;
  }

  async init() {
    try {
      if (this.initialized && this.conn && this.db) {
        // Test if connection is still valid
        try {
          await new Promise((resolve, reject) => {
            this.conn.all('SELECT 1', (err) => err ? reject(err) : resolve());
          });
          return; // Connection is valid
        } catch (e) {
          // Connection is dead, reinitialize
          this.initialized = false;
          this.conn = null;
          this.db = null;
        }
      }
      
      console.log(`Initializing database at: ${DB_PATH}`);
      this.db = new duckdb.Database(DB_PATH);
      this.conn = this.db.connect();
      this.initialized = true;
      console.log('✓ Database connection established');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  getConnection() {
    if (!this.initialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.conn;
  }

  close() {
    if (this.conn) this.conn.close();
    if (this.db) this.db.close();
    this.initialized = false;
    this.conn = null;
    this.db = null;
  }
}

const sharedDB = new SharedDB();

export async function getConnection() {
  await sharedDB.init();
  return sharedDB.getConnection();
}

export function closeConnection() {
  sharedDB.close();
}
