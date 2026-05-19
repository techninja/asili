/**
 * PGS Catalog REST API client.
 * Caches responses to disk (6-month TTL), rate-limits to 30 req/min.
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.CACHE_DIR || join(__dirname, '..', '..', '..', 'cache');
const BASE = 'https://www.pgscatalog.org/rest';
const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;
const MIN_DELAY = 100;
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;

class PGSApiClient {
  constructor() {
    /** @type {number[]} */
    this.requestTimes = [];
  }

  /** @param {string} url */
  cachePath(url) {
    const u = new URL(url);
    const seg = u.hostname + '/' + u.pathname.split('/').filter(Boolean).join('_');
    const hash = u.search
      ? crypto.createHash('md5').update(u.search).digest('hex').slice(0, 8)
      : 'no-params';
    return join(CACHE_DIR, seg, `${hash}.json`);
  }

  async readCache(url) {
    try {
      const raw = JSON.parse(await readFile(this.cachePath(url), 'utf8'));
      if (Date.now() - raw.timestamp < MAX_AGE) return raw.data;
    } catch { /* miss */ }
    return null;
  }

  async writeCache(url, data) {
    const p = this.cachePath(url);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify({ data, timestamp: Date.now(), url }));
  }

  async rateLimit() {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(t => now - t < RATE_WINDOW);
    if (this.requestTimes.length >= RATE_LIMIT) {
      const wait = RATE_WINDOW - (now - Math.min(...this.requestTimes)) + 100;
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.requestTimes = this.requestTimes.filter(t => Date.now() - t < RATE_WINDOW);
    } else if (this.requestTimes.length > 0) {
      const gap = now - Math.max(...this.requestTimes);
      if (gap < MIN_DELAY) await new Promise(r => setTimeout(r, MIN_DELAY - gap));
    }
    this.requestTimes.push(Date.now());
  }

  async fetch(url, retries = 3) {
    const cached = await this.readCache(url);
    if (cached) return cached;
    await this.rateLimit();

    for (let i = 1; i <= retries; i++) {
      try {
        const res = await globalThis.fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        await this.writeCache(url, data);
        return data;
      } catch (err) {
        if (i === retries) throw err;
        await new Promise(r => setTimeout(r, 5000 * i));
      }
    }
  }

  getTraitInfo(id) { return this.fetch(`${BASE}/trait/${id}`); }
  getScore(id) { return this.fetch(`${BASE}/score/${id}`); }
  searchPerformance(pgsId) { return this.fetch(`${BASE}/performance/search?pgs_id=${pgsId}`); }

  async getAllTraits(limit = 250) {
    const all = [];
    let offset = 0;
    let total = null;
    while (total === null || offset < total) {
      const page = await this.fetch(`${BASE}/trait/all?limit=${limit}&offset=${offset}`);
      total = page.count;
      all.push(...page.results);
      offset += limit;
    }
    return all;
  }
}

export default new PGSApiClient();
