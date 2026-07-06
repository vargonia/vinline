import type { FastifyInstance } from 'fastify';
import type { Db } from '../../shared/db/index.ts';
import { createWineListsService } from './service.ts';
import { ok } from '../../shared/reply.ts';
import { makeAuthGuard } from '../../shared/middleware/auth-guard.ts';

const createListSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
};

const patchListSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
};

const addEntrySchema = {
  body: {
    type: 'object',
    required: ['wine_item_id'],
    additionalProperties: false,
    properties: {
      wine_item_id: { type: 'string' },
      display_name: { type: 'string' },
      sell_price_bottle: { type: 'number' },
      sell_price_glass: { type: 'number' },
      btg: { type: 'boolean' },
      category: { type: 'string' },
      sort_order: { type: 'integer' },
    },
  },
};

const patchEntrySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      display_name: { type: ['string', 'null'] },
      sell_price_bottle: { type: ['number', 'null'] },
      sell_price_glass: { type: ['number', 'null'] },
      btg: { type: 'boolean' },
      category: { type: ['string', 'null'] },
      sort_order: { type: 'integer' },
    },
  },
};

const reorderSchema = {
  body: {
    type: 'object',
    required: ['order'],
    additionalProperties: false,
    properties: {
      order: { type: 'array', items: { type: 'string' } },
    },
  },
};

export function wineListsRoutes(db: Db) {
  const svc = createWineListsService(db);
  const authGuard = makeAuthGuard(db);

  return async function plugin(app: FastifyInstance) {
    app.addHook('preHandler', authGuard);

    app.get('/', async (req) => ok(await svc.list(req.auth!.userId)));

    app.post('/', { schema: createListSchema }, async (req, reply) => {
      const l = await svc.create(req.auth!.userId, req.body as { name: string; status?: string });
      return reply.status(201).send(ok(l));
    });

    app.get('/:id', async (req) => {
      const { id } = req.params as { id: string };
      return ok(await svc.get(req.auth!.userId, id));
    });

    app.patch('/:id', { schema: patchListSchema }, async (req) => {
      const { id } = req.params as { id: string };
      return ok(await svc.update(req.auth!.userId, id, req.body as { name?: string; status?: string }));
    });

    app.delete('/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      await svc.softDelete(req.auth!.userId, id);
      return reply.status(204).send();
    });

    app.post('/:id/entries', { schema: addEntrySchema }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const e = await svc.addEntry(req.auth!.userId, id, req.body as Record<string, unknown>);
      return reply.status(201).send(ok(e));
    });

    app.patch('/:id/entries/:entryId', { schema: patchEntrySchema }, async (req) => {
      const { id, entryId } = req.params as { id: string; entryId: string };
      return ok(
        await svc.updateEntry(req.auth!.userId, id, entryId, req.body as Record<string, unknown>),
      );
    });

    app.delete('/:id/entries/:entryId', async (req, reply) => {
      const { id, entryId } = req.params as { id: string; entryId: string };
      await svc.deleteEntry(req.auth!.userId, id, entryId);
      return reply.status(204).send();
    });

    app.post('/:id/entries/reorder', { schema: reorderSchema }, async (req) => {
      const { id } = req.params as { id: string };
      const { order } = req.body as { order: string[] };
      return ok(await svc.reorder(req.auth!.userId, id, order));
    });
  };
}
