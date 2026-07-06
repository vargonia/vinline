import type { FastifyInstance } from 'fastify';
import type { Db } from '../../shared/db/index.ts';
import { createUsersService } from './service.ts';
import { ok } from '../../shared/reply.ts';
import { makeAuthGuard } from '../../shared/middleware/auth-guard.ts';

const patchMeSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      avatar_url: { type: ['string', 'null'] },
    },
  },
};

const settingsSchema = {
  body: {
    type: 'object',
    required: ['margins', 'naming_convention'],
    additionalProperties: false,
    properties: {
      margins: { type: 'object' },
      naming_convention: { type: 'object' },
    },
  },
};

export function usersRoutes(db: Db) {
  const svc = createUsersService(db);
  const authGuard = makeAuthGuard(db);

  return async function plugin(app: FastifyInstance) {
    app.addHook('preHandler', authGuard);

    app.get('/me', async (req) => ok(await svc.getMe(req.auth!.userId)));

    app.patch('/me', { schema: patchMeSchema }, async (req) =>
      ok(await svc.updateMe(req.auth!.userId, req.body as Record<string, never>)),
    );

    app.get('/me/settings', async (req) => ok(await svc.getSettings(req.auth!.userId)));

    app.put('/me/settings', { schema: settingsSchema }, async (req) =>
      ok(
        await svc.putSettings(
          req.auth!.userId,
          req.body as { margins: unknown; naming_convention: unknown },
        ),
      ),
    );
  };
}
