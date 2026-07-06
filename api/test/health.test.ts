import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp } from './helpers.ts';
import type { TestApp } from './helpers.ts';

let h: TestApp;
before(async () => {
  h = await makeTestApp();
});
after(async () => {
  await h.close();
});

test('GET /health -> 200 { status: ok, db: ok, version }', async () => {
  const res = await h.app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(res.statusCode, 200);
  const d = res.json().data;
  assert.equal(d.status, 'ok');
  assert.equal(d.db, 'ok');
  assert.ok(d.version);
});
