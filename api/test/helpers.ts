// Test harness: fresh in-memory pglite app per test file, register/login helpers.
import { createDb, runMigrations } from '../src/shared/db/index.ts';
import { buildApp } from '../src/app.ts';
import type { FastifyInstance } from 'fastify';

process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = '1'; // deterministic; rate limit exercised separately

export type TestApp = {
  app: FastifyInstance;
  close: () => Promise<void>;
};

export async function makeTestApp(): Promise<TestApp> {
  const handle = await createDb({ url: undefined, pgliteDir: 'memory://' });
  await runMigrations(handle);
  const app = await buildApp(handle);
  await app.ready();
  return {
    app,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

let counter = 0;
export function uniqueEmail(): string {
  counter += 1;
  return `user${Date.now()}_${counter}@example.com`;
}

export async function registerUser(
  app: FastifyInstance,
  overrides?: { email?: string; password?: string; name?: string },
) {
  const email = overrides?.email ?? uniqueEmail();
  const password = overrides?.password ?? 'supersecret123';
  const name = overrides?.name ?? 'Test User';
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password, name },
  });
  const body = res.json();
  return { res, email, password, name, ...body.data };
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}
