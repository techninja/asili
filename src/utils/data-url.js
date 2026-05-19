/**
 * Data URL configuration — single source of truth for data asset locations.
 * In development, data is served from /data/ (symlinked to asili-lab output).
 * In production, data is served from Cloudflare R2 at data.asili.dev.
 * @module utils/data-url
 */

/** Base URL for all data assets (trait packs, norm params, manifest, etc.) */
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const DATA_BASE = isDev ? '/data' : 'https://data.asili.dev';
