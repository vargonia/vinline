// Maps thrown errors + Fastify validation failures to the response envelope.
import type { FastifyInstance } from 'fastify';
import { AppError, errorBody } from '../errors.ts';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    // Fastify schema validation error.
    if ((err as { validation?: unknown }).validation) {
      const details = ((err as { validation?: Array<Record<string, unknown>> }).validation ?? []).map(
        (v) => ({
          field:
            (v.instancePath as string | undefined)?.replace(/^\//, '') ||
            (v.params as { missingProperty?: string } | undefined)?.missingProperty ||
            '',
          issue: (v.message as string) ?? 'invalid',
        }),
      );
      return reply.status(400).send(errorBody('VALIDATION_ERROR', err.message, details));
    }

    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }

    // Body parse errors etc. carry a statusCode.
    if ((err as { statusCode?: number }).statusCode === 400) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', err.message));
    }

    app.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Internal server error'));
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', 'Route not found'));
  });
}
