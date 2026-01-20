#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { AsiliCalcServer } from '/app/apps/calc/server.js';

const app = express();
const server = createServer(app);

// Basic middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.raw({ limit: '100mb', type: 'application/octet-stream' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Asili risk, caluclation, and trait DB Data files FIRST (before any other routes)
app.use('/data', express.static('/app/data_out', { 
  acceptRanges: true,
  etag: true,
  lastModified: true,
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.parquet')) {
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Accept-Ranges', 'bytes');
    }
  }
}));

// Calc server routes
const calcServer = new AsiliCalcServer({
  port: 0,
  dataDir: '/app/data_out',
  storageDir: '/app/server-data'
});

await calcServer.start();

app.post('/calculate/risk', (req, res) => calcServer.handleRequest(req, res));
app.get('/individuals', (req, res) => calcServer.handleRequest(req, res));
app.get('/api/risk-score/:individualId/:traitId', (req, res) => calcServer.handleRequest(req, res));
app.get('/status', (req, res) => calcServer.handleRequest(req, res));
app.get('/health', (req, res) => calcServer.handleRequest(req, res));

// Static files (but NOT catch-all)
app.use('/deps', express.static('/app/apps/web/deps'));
app.use('/packages', express.static('/app/packages'));
app.use('/lib', express.static('/app/apps/web/lib'));

// App files (specific files only, not catch-all)
app.get('/', (req, res) => res.sendFile('/app/apps/web/index.html'));
app.use(express.static('/app/apps/web', { index: false }));

// SPA fallback LAST - return 404 for now
app.get('*', (req, res) => {
  // console.log('404 for:', req.path);
  res.status(404).send('Not Found');
});

// WebSocket
const wss = new WebSocketServer({ server });
calcServer.wsServer = wss;
wss.on('connection', (ws, req) => calcServer.handleWebSocket(ws, req));

const httpServer = server.listen(80, () => console.log('🌐 Simple server running on port 80'));

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  // Force close all handles
  const handles = process._getActiveHandles();
  handles.forEach((handle) => {
    if (handle.constructor.name === 'Socket') {
      handle.destroy();
    } else if (handle.constructor.name === 'Server') {
      handle.close();
    }
  });
  
  // Cleanup calc server
  if (calcServer?.cleanup) {
    calcServer.cleanup().catch(console.error);
  }
  
  // Force exit after 2 seconds
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}