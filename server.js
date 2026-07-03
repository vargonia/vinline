// vinline — zero-dependency Node server for Railway (and any Node host).
// Serves static files from the repo root and proxies POST /api/claude to the
// Anthropic API. Deployable twin of serve.ps1 (local Windows dev server).
//
// Key resolution (bring-your-own-key first):
//   1. x-api-key-fwd request header — the user's own key, entered in the app's
//      Settings and stored only in their browser
//   2. ANTHROPIC_API_KEY env var — server-side key. If SHARED_ACCESS_CODE is
//      also set, the request must carry a matching x-access-code header
//      (shared-instance mode: friends get a code, not an API key). Without
//      SHARED_ACCESS_CODE the env key is open to anyone with the URL — only
//      appropriate for a personal instance whose URL stays private.
// If nothing applies the proxy returns 401/403 with a message pointing the
// user at Settings.
//
// Shared-instance metering: env-key parses are counted per UTC day and capped
// by MAX_PARSES_PER_DAY (default 200) — a blunt guard against a leaked code.

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const MAX_BODY = 30 * 1024 * 1024; // canvas-resized invoice photos are a few MB as base64
const MAX_PARSES_PER_DAY = parseInt(process.env.MAX_PARSES_PER_DAY, 10) || 200;

const meter = { day: '', count: 0 };

function meterTick() {
  const today = new Date().toISOString().slice(0, 10);
  if (meter.day !== today) { meter.day = today; meter.count = 0; }
  meter.count += 1;
  console.log(`[meter] shared-key parse #${meter.count} on ${meter.day}`);
  return meter.count;
}

function codeMatches(supplied, expected) {
  if (!supplied || !expected) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function proxyClaude(req, res) {
  let key = req.headers['x-api-key-fwd'] || '';

  if (!key && process.env.ANTHROPIC_API_KEY) {
    if (process.env.SHARED_ACCESS_CODE) {
      // Shared-instance mode: the server key is gated behind the access code
      if (!codeMatches(req.headers['x-access-code'], process.env.SHARED_ACCESS_CODE)) {
        sendJson(res, 403, { error: { type: 'access_code_required', message: 'This vinline instance needs an access code. Ask the person who shared it with you, then add the code in Settings.' } });
        return;
      }
      if (meterTick() > MAX_PARSES_PER_DAY) {
        sendJson(res, 429, { error: { type: 'rate_limited', message: 'This instance hit its daily parse limit. Try again tomorrow, or use your own API key in Settings.' } });
        return;
      }
    }
    key = process.env.ANTHROPIC_API_KEY;
  }

  if (!key) {
    sendJson(res, 401, { error: { type: 'authentication_error', message: 'No API key. Open Settings in the app and add your Anthropic API key.' } });
    return;
  }

  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      sendJson(res, 413, { error: { message: 'Request too large.' } });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    const body = Buffer.concat(chunks);
    // ANTHROPIC_API_URL override exists for the test suite (mock upstream);
    // production always defaults to the real API.
    const apiUrl = new URL(process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages');
    const transport = apiUrl.protocol === 'http:' ? http : https;
    const upstream = transport.request({
      hostname: apiUrl.hostname,
      port: apiUrl.port || undefined,
      path: apiUrl.pathname,
      method: 'POST',
      timeout: 120000,
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      }
    }, (up) => {
      res.writeHead(up.statusCode || 502, { 'content-type': 'application/json' });
      up.pipe(res);
    });
    upstream.on('timeout', () => {
      upstream.destroy();
      if (!res.headersSent) sendJson(res, 504, { error: { message: 'Upstream timeout talking to the Anthropic API.' } });
    });
    upstream.on('error', (err) => {
      if (!res.headersSent) sendJson(res, 502, { error: { message: 'Proxy error: ' + err.message } });
    });
    upstream.end(body);
  });
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400); res.end('Bad request'); return;
  }

  // Canonical entry: the app lives at /app/ (relative asset paths depend on the trailing slash)
  if (urlPath === '/' || urlPath === '/app') {
    res.writeHead(302, { location: '/app/' });
    res.end();
    return;
  }

  // Never serve dotfiles (.git, .claude, ...) or the local key wrapper
  if (urlPath.split('/').some(seg => seg.startsWith('.')) || urlPath.endsWith('serve.local.ps1')) {
    res.writeHead(404); res.end('Not found'); return;
  }

  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404 Not Found: ' + urlPath);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'content-length': data.length
      });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/claude') {
    proxyClaude(req, res);
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
  } else {
    res.writeHead(405, { allow: 'GET, HEAD, POST' });
    res.end('Method not allowed');
  }
});

server.listen(PORT, () => {
  console.log(`vinline serving on port ${PORT} — app at /app/`);
});
