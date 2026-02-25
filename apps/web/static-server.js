#!/usr/bin/env node
import express from 'express';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/data', express.static('data_out', { 
  acceptRanges: true,
  etag: true,
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.parquet')) {
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Accept-Ranges', 'bytes');
    }
  }
}));

app.use('/deps', express.static('apps/web/deps'));
app.use('/packages', express.static('packages'));
app.use('/lib', express.static('apps/web/lib'));
app.get('/', (req, res) => res.sendFile(process.cwd() + '/apps/web/index.html'));
app.use(express.static('apps/web', { index: false }));

app.listen(4242, () => console.log('📦 Static server on http://localhost:4242'));
