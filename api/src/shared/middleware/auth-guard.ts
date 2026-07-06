// Bearer JWT auth guard. Verifies signature + that the session still exists
// (logout deletes the session row, killing access immediately-ish on next check).
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { verifyAccessToken } from '../crypto.ts';
import { AppError } from '../errors.ts';
import type { Db } from '../db/index.ts';
import { sessions } from '../db/schema.ts';

export type AuthContext = { userId: string; sessionId: string };

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export function makeAuthGuard(db: Db) {
  return async function authGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid access token');
    }
    const token = header.slice('Bearer '.length).trim();
    const claims = await verifyAccessToken(token);
    if (!claims) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid access token');
    }
    // Session must still exist (logout deletes it).
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, claims.sessionId))
      .limit(1);
    if (rows.length === 0) {
      throw new AppError('UNAUTHORIZED', 'Session no longer valid');
    }
    req.auth = claims;
  };
}
