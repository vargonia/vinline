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

async function createItem(token: string, body: Record<string, unknown>) {
  return h.app.inject({
    method: 'POST',
    url: '/api/v1/inventory',
    headers: authHeader(token),
    payload: body,
  });
}

test('CRUD: create -> get -> patch -> list', async () => {
  const u = await registerUser(h.app);
  const create = await createItem(u.access_token, {
    name: 'Barolo',
    vintage: '2019',
    region: 'Piedmont',
    size: '750ml',
    qty_bottles: 6,
    cost_per_bottle: 42.5,
  });
  assert.equal(create.statusCode, 201);
  const item = create.json().data;
  assert.equal(item.name, 'Barolo');
  assert.equal(item.qty_bottles, 6);

  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/inventory/${item.id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(get.statusCode, 200);
  assert.equal(get.json().data.region, 'Piedmont');

  const patch = await h.app.inject({
    method: 'PATCH',
    url: `/api/v1/inventory/${item.id}`,
    headers: authHeader(u.access_token),
    payload: { qty_bottles: 3, region: 'Barolo DOCG' },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().data.qty_bottles, 3);
  assert.equal(patch.json().data.region, 'Barolo DOCG');

  const list = await h.app.inject({
    method: 'GET',
    url: '/api/v1/inventory',
    headers: authHeader(u.access_token),
  });
  assert.equal(list.statusCode, 200);
  const listBody = list.json();
  assert.ok(Array.isArray(listBody.data));
  assert.ok(listBody.data.some((x: { id: string }) => x.id === item.id));
  assert.ok('nextCursor' in listBody.meta);
});

test('soft delete hides item from list + 404 on get', async () => {
  const u = await registerUser(h.app);
  const c = await createItem(u.access_token, { name: 'Chablis' });
  const id = c.json().data.id;

  const del = await h.app.inject({
    method: 'DELETE',
    url: `/api/v1/inventory/${id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(del.statusCode, 204);

  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/inventory/${id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(get.statusCode, 404);

  const list = await h.app.inject({
    method: 'GET',
    url: '/api/v1/inventory',
    headers: authHeader(u.access_token),
  });
  assert.ok(!list.json().data.some((x: { id: string }) => x.id === id));
});

test('active filter', async () => {
  const u = await registerUser(h.app);
  await createItem(u.access_token, { name: 'ActiveWine', active: true });
  await createItem(u.access_token, { name: 'InactiveWine', active: false });
  const res = await h.app.inject({
    method: 'GET',
    url: '/api/v1/inventory?active=true',
    headers: authHeader(u.access_token),
  });
  const names = res.json().data.map((x: { name: string }) => x.name);
  assert.ok(names.includes('ActiveWine'));
  assert.ok(!names.includes('InactiveWine'));
});

test('cursor pagination walks all rows without dupes', async () => {
  const u = await registerUser(h.app);
  for (let i = 0; i < 5; i++) {
    await createItem(u.access_token, { name: `Pag${i}` });
  }
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const url: string = `/api/v1/inventory?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await h.app.inject({ method: 'GET', url, headers: authHeader(u.access_token) });
    const body = res.json();
    for (const item of body.data) {
      assert.ok(!seen.has(item.id), 'no duplicate across pages');
      seen.add(item.id);
    }
    cursor = body.meta.nextCursor;
    pages += 1;
    assert.ok(pages < 10, 'no infinite loop');
  } while (cursor);
  assert.ok(seen.size >= 5);
});

test('cross-user ownership: cannot read another user item -> 404', async () => {
  const owner = await registerUser(h.app);
  const other = await registerUser(h.app);
  const c = await createItem(owner.access_token, { name: 'Secret' });
  const id = c.json().data.id;

  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/inventory/${id}`,
    headers: authHeader(other.access_token),
  });
  assert.equal(get.statusCode, 404);

  const patch = await h.app.inject({
    method: 'PATCH',
    url: `/api/v1/inventory/${id}`,
    headers: authHeader(other.access_token),
    payload: { name: 'Hacked' },
  });
  assert.equal(patch.statusCode, 404);

  const del = await h.app.inject({
    method: 'DELETE',
    url: `/api/v1/inventory/${id}`,
    headers: authHeader(other.access_token),
  });
  assert.equal(del.statusCode, 404);
});
