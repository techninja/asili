import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8080;
const HOST = '0.0.0.0'; // Listen on all interfaces for Docker

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

createServer(async (req, res) => {
  // CORS + SharedArrayBuffer headers for DuckDB WASM
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy /data requests to CDN
  if (req.url.startsWith('/data/')) {
    try {
      const cdnUrl = `http://cdn${req.url}`;
      const response = await fetch(cdnUrl);
      
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      if (response.headers.get('content-length')) {
        res.setHeader('Content-Length', response.headers.get('content-length'));
      }
      
      res.writeHead(response.status);
      const buffer = await response.arrayBuffer();
      res.end(Buffer.from(buffer));
      return;
    } catch (error) {
      res.writeHead(500);
      res.end('CDN Error');
      return;
    }
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Serve bundled files from root
  if (filePath === '/duckdb-bundle.mjs') {
    filePath = join(__dirname, 'duckdb-bundle.mjs');
  } else if (filePath.startsWith('/dist/')) {
    filePath = join(__dirname, filePath);
  } else if (filePath.startsWith('/node_modules/')) {
    filePath = join(__dirname, filePath);
  } else {
    filePath = join(__dirname, filePath);
  }

  try {
    await stat(filePath);
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});