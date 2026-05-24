/**
 * Data URL configuration — single source of truth for data asset locations.
 * In development, data is served from /data/ (symlinked to asili-lab output).
 * In production, data is served from Cloudflare R2 at data.asili.dev.
 * @module utils/data-url
 */

/** True when running on a local dev environment. */
export const isDev =
  ['localhost', '127.0.0.1', 'chromeo', 'asili.tn42.com'].includes(window.location.hostname) ||
  window.location.port === '4242';

/** Base URL for all data assets (trait packs, norm params, manifest, etc.) */
export const DATA_BASE = isDev ? '/data' : 'https://data.asili.dev';
