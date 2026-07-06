import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeTestApp, registerUser, authHeader, uniqueEmail } from './helpers.ts';
import type { TestApp } from './helpers.ts';

let h: TestApp;
before(async () => {
  h = await makeTestApp();
});
after(async () => {
  await h.close();
});

test('register happy path returns 201 + tokens + user', async () => {
  const email = uniqueEmail();
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'password1234', name: 'Alice' },
  });
  assert.equal(res.statusCode, 201);
  const b = res.json().data;
  assert.ok(b.access_token);
  assert.ok(b.refresh_token);
  assert.equal(b.user.email, email);
  assert.equal(b.user.email_verified, false);
});

test('register rejects short password with VALIDATION_ERROR', async () => {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: uniqueEmail(), password: 'short', name: 'Bob' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'VALIDATION_ERROR');
});

test('duplicate email -> 409 CONFLICT', async () => {
  const email = uniqueEmail();
  await registerUser(h.app, { email });
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'password1234', name: 'Dup' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error.code, 'CONFLICT');
});

test('login happy path', async () => {
  const email = uniqueEmail();
  await registerUser(h.app, { email, password: 'password1234' });
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'password1234' },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().data.access_token);
});

test('login wrong password -> 401 UNAUTHORIZED', async () => {
  const email = uniqueEmail();
  await registerUser(h.app, { email, password: 'password1234' });
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'wrongpassword99' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});

test('refresh rotation: old refresh token unusable after use', async () => {
  const u = await registerUser(h.app);
  const first = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    payload: { refresh_token: u.refresh_token },
  });
  assert.equal(first.statusCode, 200);
  const rotated = first.json().data;
  assert.ok(rotated.refresh_token);
  assert.notEqual(rotated.refresh_token, u.refresh_token);

  // Reusing the old token must fail.
  const reuse = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    payload: { refresh_token: u.refresh_token },
  });
  assert.equal(reuse.statusCode, 401);

  // New token works.
  const again = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    payload: { refresh_token: rotated.refresh_token },
  });
  assert.equal(again.statusCode, 200);
});

test('logout kills refresh token + access', async () => {
  const u = await registerUser(h.app);
  const logout = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: authHeader(u.access_token),
  });
  assert.equal(logout.statusCode, 204);

  // Refresh now dead.
  const refresh = await h.app.inject({
    method: 'POST',
    url: '/api/v1/auth/refresh',
    payload: { refresh_token: u.refresh_token },
  });
  assert.equal(refresh.statusCode, 401);

  // Access token now dead (session deleted).
  const me = await h.app.inject({
    method: 'GET',
    url: '/api/v1/users/me',
    headers: authHeader(u.access_token),
  });
  assert.equal(me.statusCode, 401);
});

test('unauthorized access without token -> 401', async () => {
  const res = await h.app.inject({ method: 'GET', url: '/api/v1/users/me' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, 'UNAUTHORIZED');
});
