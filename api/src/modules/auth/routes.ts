import type { FastifyInstance } from 'fastify';
import type { Db } from '../../shared/db/index.ts';
import { createAuthService } from './service.ts';
import { ok } from '../../shared/reply.ts';
import { makeAuthGuard } from '../../shared/middleware/auth-guard.ts';
import { createRateLimiter, rateLimitEnabled } from '../../shared/middleware/rate-limit.ts';

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 10 },
      name: { type: 'string', minLength: 1 },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
  },
};

const refreshSchema = {
  body: {
    type: 'object',
    required: ['refresh_token'],
    additionalProperties: false,
    properties: { refresh_token: { type: 'string' } },
  },
};

export function authRoutes(db: Db) {
  const svc = createAuthService(db);
  const authGuard = makeAuthGuard(db);
  const authLimiter = createRateLimiter(10);

  return async function plugin(app: FastifyInstance) {
    const limit = (req: Parameters<typeof authLimiter>[0]) => {
      if (rateLimitEnabled()) authLimiter(req);
    };

    app.post('/register', { schema: registerSchema }, async (req, reply) => {
      limit(req);
      const body = req.body as { email: string; password: string; name: string };
      const result = await svc.register({
        ...body,
        deviceHint: req.headers['x-client'] as string | undefined,
        ip: req.ip,
      });
      return reply.status(201).send(ok(result));
    });

    app.post('/login', { schema: loginSchema }, async (req, reply) => {
      limit(req);
      const body = req.body as { email: string; password: string };
      const result = await svc.login({
        ...body,
        deviceHint: req.headers['x-client'] as string | undefined,
        ip: req.ip,
      });
      return reply.status(200).send(ok(result));
    });

    app.post('/refresh', { schema: refreshSchema }, async (req, reply) => {
      const body = req.body as { refresh_token: string };
      const result = await svc.refresh({
        refresh_token: body.refresh_token,
        deviceHint: req.headers['x-client'] as string | undefined,
        ip: req.ip,
      });
      return reply.status(200).send(ok(result));
    });

    app.post('/logout', { preHandler: authGuard }, async (req, reply) => {
      await svc.logout(req.auth!.sessionId);
      return reply.status(204).send();
    });
  };
}
