import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp, registerUser, authHeader } from './helpers.ts';
import type { TestApp } from './helpers.ts';

let h: TestApp;
before(async () => {
  h = await makeTestApp();
});
after(async () => {
  await h.close();
});

test('GET /users/me returns profile', async () => {
  const u = await registerUser(h.app, { name: 'Carol' });
  const res = await h.app.inject({
    method: 'GET',
    url: '/api/v1/users/me',
    headers: authHeader(u.access_token),
  });
  assert.equal(res.statusCode, 200);
  const me = res.json().data;
  assert.equal(me.name, 'Carol');
  assert.equal(me.email, u.email);
});

test('PATCH /users/me updates name + avatar', async () => {
  const u = await registerUser(h.app);
  const res = await h.app.inject({
    method: 'PATCH',
    url: '/api/v1/users/me',
    headers: authHeader(u.access_token),
    payload: { name: 'Renamed', avatar_url: 'https://x/y.png' },
  });
  assert.equal(res.statusCode, 200);
  const me = res.json().data;
  assert.equal(me.name, 'Renamed');
  assert.equal(me.avatar_url, 'https://x/y.png');
});

test('settings round-trip: PUT then GET returns same JSONB', async () => {
  const u = await registerUser(h.app);
  const margins = { red_bottle: 3.5, white_bottle: 3.2, btg: 4, sparkling: 3.8 };
  const naming = { include_appellation: true, include_vintage: true, include_region: false };
  const put = await h.app.inject({
    method: 'PUT',
    url: '/api/v1/users/me/settings',
    headers: authHeader(u.access_token),
    payload: { margins, naming_convention: naming },
  });
  assert.equal(put.statusCode, 200);
  const get = await h.app.inject({
    method: 'GET',
    url: '/api/v1/users/me/settings',
    headers: authHeader(u.access_token),
  });
  assert.equal(get.statusCode, 200);
  const s = get.json().data;
  assert.deepEqual(s.margins, margins);
  assert.deepEqual(s.naming_convention, naming);
});

test('PUT settings rejects non-object margins with VALIDATION_ERROR', async () => {
  const u = await registerUser(h.app);
  const res = await h.app.inject({
    method: 'PUT',
    url: '/api/v1/users/me/settings',
    headers: authHeader(u.access_token),
    payload: { margins: 'nope', naming_convention: {} },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'VALIDATION_ERROR');
});
