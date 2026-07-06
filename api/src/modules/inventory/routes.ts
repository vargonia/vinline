import type { FastifyInstance } from 'fastify';
import type { Db } from '../../shared/db/index.ts';
import { createInventoryService } from './service.ts';
import { ok } from '../../shared/reply.ts';
import { makeAuthGuard } from '../../shared/middleware/auth-guard.ts';

const createSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      vintage: { type: 'string' },
      region: { type: 'string' },
      size: { type: 'string' },
      qty_bottles: { type: 'integer', minimum: 0 },
      cost_per_bottle: { type: 'number' },
      active: { type: 'boolean' },
    },
  },
};

const patchSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      vintage: { type: 'string' },
      region: { type: 'string' },
      size: { type: 'string' },
      qty_bottles: { type: 'integer', minimum: 0 },
      cost_per_bottle: { type: ['number', 'null'] },
      active: { type: 'boolean' },
    },
  },
};

const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      cursor: { type: 'string' },
      active: { type: 'boolean' },
    },
  },
};

export function inventoryRoutes(db: Db) {
  const svc = createInventoryService(db);
  const authGuard = makeAuthGuard(db);

  return async function plugin(app: FastifyInstance) {
    app.addHook('preHandler', authGuard);

    app.get('/', { schema: listSchema }, async (req) => {
      const q = req.query as { limit?: number; cursor?: string; active?: boolean };
      const result = await svc.list(req.auth!.userId, {
        limit: q.limit ?? 50,
        cursor: q.cursor,
        active: q.active,
      });
      return ok(result.data, result.meta);
    });

    app.post('/', { schema: createSchema }, async (req, reply) => {
      const w = await svc.create(req.auth!.userId, req.body as Record<string, unknown>);
      return reply.status(201).send(ok(w));
    });

    app.get('/:id', async (req) => {
      const { id } = req.params as { id: string };
      return ok(await svc.get(req.auth!.userId, id));
    });

    app.patch('/:id', { schema: patchSchema }, async (req) => {
      const { id } = req.params as { id: string };
      return ok(await svc.update(req.auth!.userId, id, req.body as Record<string, unknown>));
    });

    app.delete('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      await svc.softDelete(req.auth!.userId, id);
      return reply.status(204).send();
    });
  };
}
