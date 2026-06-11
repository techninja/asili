/**
 * Static dev server — serves src/ for the browser with SPA fallback.
 * @module server
 */

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')).version;
const DATA_DIR = resolve(__dirname, 'data');

/** @type {any} */
const app = express();

// Serve index.html with version injected
app.get(['/', '/index.html'], (_req, res) => {
  let html = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
  html = html.replace(
    /<meta name="app-version" content="[^"]*" \/>/,
    `<meta name="app-version" content="${VERSION}" />`,
  );
  res.type('html').send(html);
});

app.use(express.static('src'));
app.use('/packages', express.static('packages'));

// Proxy /data requests to production CDN when local data symlink is missing
app.use('/data', (req, res, next) => {
  const localPath = resolve(DATA_DIR, req.path.slice(1));
  if (existsSync(localPath)) return next();
  const cdnUrl = `https://data.asili.dev${req.path}`;
  fetch(cdnUrl, { headers: req.headers.range ? { Range: req.headers.range } : {} })
    .then(async (upstream) => {
      if (!upstream.ok) return res.status(upstream.status).end();
      res.status(upstream.status);
      upstream.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding'].includes(k)) res.setHeader(k, v);
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    })
    .catch(() => res.status(502).end());
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.includes('.')) {
    let html = readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
    html = html.replace(
      /<meta name="app-version" content="[^"]*" \/>/,
      `<meta name="app-version" content="${VERSION}" />`,
    );
    return res.type('html').send(html);
  }
  next();
});

/** @param {number} [port] */
export function start(port = 3000) {
  const server = app.listen(port, () => console.log(`http://localhost:${port}`));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start(parseInt(process.env.PORT) || 3000);
}

export default app;
