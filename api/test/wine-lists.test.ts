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

async function makeItem(token: string, name: string) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/inventory',
    headers: authHeader(token),
    payload: { name },
  });
  return res.json().data.id as string;
}

async function makeList(token: string, name: string) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/v1/wine-lists',
    headers: authHeader(token),
    payload: { name },
  });
  return res.json().data.id as string;
}

test('list CRUD + soft delete', async () => {
  const u = await registerUser(h.app);
  const create = await h.app.inject({
    method: 'POST',
    url: '/api/v1/wine-lists',
    headers: authHeader(u.access_token),
    payload: { name: 'Spring List' },
  });
  assert.equal(create.statusCode, 201);
  const id = create.json().data.id;
  assert.equal(create.json().data.status, 'draft');

  const patch = await h.app.inject({
    method: 'PATCH',
    url: `/api/v1/wine-lists/${id}`,
    headers: authHeader(u.access_token),
    payload: { status: 'published', name: 'Spring 2026' },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().data.status, 'published');

  const del = await h.app.inject({
    method: 'DELETE',
    url: `/api/v1/wine-lists/${id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(del.statusCode, 204);

  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/wine-lists/${id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(get.statusCode, 404);
});

test('entries: add, patch, and reorder persist order', async () => {
  const u = await registerUser(h.app);
  const listId = await makeList(u.access_token, 'My List');
  const item1 = await makeItem(u.access_token, 'Wine A');
  const item2 = await makeItem(u.access_token, 'Wine B');
  const item3 = await makeItem(u.access_token, 'Wine C');

  const e1 = (
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/wine-lists/${listId}/entries`,
      headers: authHeader(u.access_token),
      payload: { wine_item_id: item1, sell_price_bottle: 60, category: 'red', sort_order: 0 },
    })
  ).json().data;
  const e2 = (
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/wine-lists/${listId}/entries`,
      headers: authHeader(u.access_token),
      payload: { wine_item_id: item2, sort_order: 1 },
    })
  ).json().data;
  const e3 = (
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/wine-lists/${listId}/entries`,
      headers: authHeader(u.access_token),
      payload: { wine_item_id: item3, sort_order: 2 },
    })
  ).json().data;

  // Patch e1 display name + btg.
  const patch = await h.app.inject({
    method: 'PATCH',
    url: `/api/v1/wine-lists/${listId}/entries/${e1.id}`,
    headers: authHeader(u.access_token),
    payload: { display_name: 'Wine A Reserve', btg: true },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().data.display_name, 'Wine A Reserve');
  assert.equal(patch.json().data.btg, true);

  // Reorder to reversed.
  const reorder = await h.app.inject({
    method: 'POST',
    url: `/api/v1/wine-lists/${listId}/entries/reorder`,
    headers: authHeader(u.access_token),
    payload: { order: [e3.id, e2.id, e1.id] },
  });
  assert.equal(reorder.statusCode, 200);

  // GET list and confirm order persisted.
  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/wine-lists/${listId}`,
    headers: authHeader(u.access_token),
  });
  const entries = get.json().data.entries;
  assert.deepEqual(
    entries.map((e: { id: string }) => e.id),
    [e3.id, e2.id, e1.id],
  );
  assert.deepEqual(
    entries.map((e: { sort_order: number }) => e.sort_order),
    [0, 1, 2],
  );
});

test('delete entry removes it', async () => {
  const u = await registerUser(h.app);
  const listId = await makeList(u.access_token, 'L');
  const item = await makeItem(u.access_token, 'X');
  const e = (
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/wine-lists/${listId}/entries`,
      headers: authHeader(u.access_token),
      payload: { wine_item_id: item },
    })
  ).json().data;
  const del = await h.app.inject({
    method: 'DELETE',
    url: `/api/v1/wine-lists/${listId}/entries/${e.id}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(del.statusCode, 204);
  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/wine-lists/${listId}`,
    headers: authHeader(u.access_token),
  });
  assert.equal(get.json().data.entries.length, 0);
});

test('cross-user ownership on wine list -> 404', async () => {
  const owner = await registerUser(h.app);
  const other = await registerUser(h.app);
  const listId = await makeList(owner.access_token, 'Private');

  const get = await h.app.inject({
    method: 'GET',
    url: `/api/v1/wine-lists/${listId}`,
    headers: authHeader(other.access_token),
  });
  assert.equal(get.statusCode, 404);

  const patch = await h.app.inject({
    method: 'PATCH',
    url: `/api/v1/wine-lists/${listId}`,
    headers: authHeader(other.access_token),
    payload: { name: 'stolen' },
  });
  assert.equal(patch.statusCode, 404);
});

test('cannot add another user item to own list -> 404', async () => {
  const owner = await registerUser(h.app);
  const other = await registerUser(h.app);
  const othersItem = await makeItem(other.access_token, 'Not Yours');
  const myList = await makeList(owner.access_token, 'Mine');
  const res = await h.app.inject({
    method: 'POST',
    url: `/api/v1/wine-lists/${myList}/entries`,
    headers: authHeader(owner.access_token),
    payload: { wine_item_id: othersItem },
  });
  assert.equal(res.statusCode, 404);
});
