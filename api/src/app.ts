// Fastify instance: plugins, error envelope, module registration, health.
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { createDb } from './shared/db/index.ts';
import { registerErrorHandler } from './shared/middleware/error-handler.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { usersRoutes } from './modules/users/routes.ts';
import { inventoryRoutes } from './modules/inventory/routes.ts';
import { wineListsRoutes } from './modules/wine-lists/routes.ts';
import { ok } from './shared/reply.ts';

export const API_VERSION = '1.0.0';

type DbHandle = Awaited<ReturnType<typeof createDb>>;

export async function buildApp(handle: DbHandle): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
  });

  await app.register(cors, { origin: true });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-API-Version', API_VERSION);
    return payload;
  });

  registerErrorHandler(app);

  const { db } = handle;

  app.get('/api/v1/health', async () => {
    let dbOk = 'ok';
    try {
      await handle._raw.query('select 1');
    } catch {
      dbOk = 'error';
    }
    return ok({ status: 'ok', db: dbOk, version: API_VERSION });
  });

  await app.register(authRoutes(db), { prefix: '/api/v1/auth' });
  await app.register(usersRoutes(db), { prefix: '/api/v1/users' });
  await app.register(inventoryRoutes(db), { prefix: '/api/v1/inventory' });
  await app.register(wineListsRoutes(db), { prefix: '/api/v1/wine-lists' });

  return app;
}
