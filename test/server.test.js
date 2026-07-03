// vinline — server.js contract tests (node:test, zero dependencies).
// Each scenario spawns server.js as a child process with a controlled env,
// waits for it to listen, exercises the HTTP contract, then kills it.
// A local mock "Anthropic" upstream stands in via ANTHROPIC_API_URL.

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');

// ── mock Anthropic upstream ──────────────────────────────────────────────────
let mock;
let mockUrl;
let lastMockRequest = null;

before(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastMockRequest = { headers: req.headers, body };
      const key = req.headers['x-api-key'] || '';
      if (key.startsWith('sk-ant-valid')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ content: [{ text: '[]' }] }));
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      }
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  mockUrl = `http://127.0.0.1:${mock.address().port}/v1/messages`;
});

after(() => mock.close());

// ── helpers ──────────────────────────────────────────────────────────────────
async function startServer(env = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_URL: mockUrl, ANTHROPIC_API_KEY: '', SHARED_ACCESS_CODE: '', MAX_PARSES_PER_DAY: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (d) => { if (String(d).includes('serving')) { clearTimeout(t); resolve(); } });
    child.stderr.on('data', (d) => { clearTimeout(t); reject(new Error('server stderr: ' + d)); });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error('server exited early: ' + code)); });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => new Promise((r) => { child.on('exit', r); child.kill(); })
  };
}

function parseBody(body) {
  return JSON.stringify({ model: 'x', max_tokens: 1, messages: [] });
}

// ── static serving contract ──────────────────────────────────────────────────
test('root serves the landing page; bare /app redirects to /app/', async () => {
  const s = await startServer();
  try {
    const landing = await fetch(s.base + '/');
    assert.equal(landing.status, 200);
    assert.match(landing.headers.get('content-type'), /text\/html/);
    const body = await landing.text();
    assert.match(body, /vinline/);
    assert.match(body, /href="\/app\/"/);

    const bare = await fetch(s.base + '/app', { redirect: 'manual' });
    assert.equal(bare.status, 302);
    assert.equal(bare.headers.get('location'), '/app/');
  } finally { await s.stop(); }
});

test('serves app html, css, js with correct MIME types', async () => {
  const s = await startServer();
  try {
    const html = await fetch(s.base + '/app/');
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    const css = await fetch(s.base + '/app/css/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    const js = await fetch(s.base + '/app/js/main.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /application\/javascript/);
  } finally { await s.stop(); }
});

test('blocks dotfiles, serve.local.ps1, and path traversal', async () => {
  const s = await startServer();
  try {
    assert.equal((await fetch(s.base + '/.git/config')).status, 404);
    assert.equal((await fetch(s.base + '/serve.local.ps1')).status, 404);
    const traversal = await fetch(s.base + '/app/%2e%2e/%2e%2e/etc/passwd');
    assert.ok([403, 404].includes(traversal.status), 'traversal must not resolve, got ' + traversal.status);
  } finally { await s.stop(); }
});

test('rejects non-GET/HEAD/POST methods', async () => {
  const s = await startServer();
  try {
    assert.equal((await fetch(s.base + '/app/', { method: 'DELETE' })).status, 405);
  } finally { await s.stop(); }
});

// ── proxy key resolution ─────────────────────────────────────────────────────
test('no credentials and no server key → 401 pointing at Settings', async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.base + '/api/claude', { method: 'POST', body: parseBody() });
    assert.equal(res.status, 401);
    const j = await res.json();
    assert.equal(j.error.type, 'authentication_error');
    assert.match(j.error.message, /Settings/);
  } finally { await s.stop(); }
});

test('x-api-key-fwd (BYOK) is forwarded upstream as x-api-key', async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(),
      headers: { 'x-api-key-fwd': 'sk-ant-valid-byok' }
    });
    assert.equal(res.status, 200);
    assert.equal(lastMockRequest.headers['x-api-key'], 'sk-ant-valid-byok');
  } finally { await s.stop(); }
});

test('server key WITHOUT access code env behaves as open personal instance', async () => {
  const s = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-valid-server' });
  try {
    const res = await fetch(s.base + '/api/claude', { method: 'POST', body: parseBody() });
    assert.equal(res.status, 200);
    assert.equal(lastMockRequest.headers['x-api-key'], 'sk-ant-valid-server');
  } finally { await s.stop(); }
});

test('shared mode: missing or wrong access code → 403, correct code → server key used', async () => {
  const s = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-valid-server', SHARED_ACCESS_CODE: 'grand-cru' });
  try {
    const missing = await fetch(s.base + '/api/claude', { method: 'POST', body: parseBody() });
    assert.equal(missing.status, 403);
    assert.equal((await missing.json()).error.type, 'access_code_required');

    const wrong = await fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(), headers: { 'x-access-code': 'plonk' }
    });
    assert.equal(wrong.status, 403);

    const right = await fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(), headers: { 'x-access-code': 'grand-cru' }
    });
    assert.equal(right.status, 200);
    assert.equal(lastMockRequest.headers['x-api-key'], 'sk-ant-valid-server');
  } finally { await s.stop(); }
});

test('shared mode: BYOK header bypasses the access code entirely', async () => {
  const s = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-valid-server', SHARED_ACCESS_CODE: 'grand-cru' });
  try {
    const res = await fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(), headers: { 'x-api-key-fwd': 'sk-ant-valid-own' }
    });
    assert.equal(res.status, 200);
    assert.equal(lastMockRequest.headers['x-api-key'], 'sk-ant-valid-own');
  } finally { await s.stop(); }
});

test('shared mode: daily cap returns 429 after MAX_PARSES_PER_DAY coded parses', async () => {
  const s = await startServer({ ANTHROPIC_API_KEY: 'sk-ant-valid-server', SHARED_ACCESS_CODE: 'grand-cru', MAX_PARSES_PER_DAY: '2' });
  try {
    const hit = () => fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(), headers: { 'x-access-code': 'grand-cru' }
    });
    assert.equal((await hit()).status, 200);
    assert.equal((await hit()).status, 200);
    const third = await hit();
    assert.equal(third.status, 429);
    assert.equal((await third.json()).error.type, 'rate_limited');
  } finally { await s.stop(); }
});

test('client error log endpoint accepts POST and returns 204', async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.base + '/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'error', message: 'test error', version: '1.1.0' })
    });
    assert.equal(res.status, 204);
  } finally { await s.stop(); }
});

test('upstream auth errors pass through with upstream status', async () => {
  const s = await startServer();
  try {
    const res = await fetch(s.base + '/api/claude', {
      method: 'POST', body: parseBody(), headers: { 'x-api-key-fwd': 'sk-ant-INVALID' }
    });
    assert.equal(res.status, 401);
    const j = await res.json();
    assert.equal(j.error.type, 'authentication_error');
  } finally { await s.stop(); }
});
