#!/usr/bin/env node
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// 간단 메모리 캐시 (text+target → translation). 서버 재시작 시 소실.
const cache = new Map();

function translateGoogle(text, target, source) {
  return new Promise((resolve, reject) => {
    const key = `${source || 'auto'}::${target}::${text}`;
    if (cache.has(key)) return resolve({ ...cache.get(key), cached: true });

    const sl = source || 'auto';
    const q = encodeURIComponent(text);
    const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${target}&dt=t&q=${q}`;

    https.get(apiUrl, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const arr = JSON.parse(data);
          // arr[0] = [[translatedSegment, origSegment, ...], ...]
          // arr[2] = detected source language
          const translated = (arr[0] || []).map(seg => seg[0]).filter(Boolean).join('');
          const detected = arr[2] || sl;
          const entry = { translated, detected };
          cache.set(key, entry);
          resolve({ ...entry, cached: false });
        } catch (e) {
          reject(new Error('parse failed: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // ── 번역 프록시 엔드포인트 ──────────────────────────────────
  if (parsed.pathname === '/translate' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { text, target, source } = JSON.parse(body || '{}');
      if (!text || !target) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'text and target required' }));
        return;
      }
      const result = await translateGoogle(text, target, source);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // CORS preflight (동일 origin이라 불필요하지만 혹시 대비)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── 정적 파일 ────────────────────────────────────────────────
  let urlPath = decodeURIComponent(parsed.pathname);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`HTTP server listening at http://localhost:${PORT}`);
  console.log(`Translate proxy: POST /translate  body: {text, target, source?}`);
  console.log(`Open http://localhost:${PORT}/ in browser (open 2 tabs to test 2 clients)`);
});
