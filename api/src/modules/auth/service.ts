// Auth service: register, login, refresh (rotate-on-use), logout.
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../../shared/db/index.ts';
import { users, sessions, userSettings } from '../../shared/db/schema.ts';
import {
  hashPassword,
  verifyPassword,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../../shared/crypto.ts';
import { AppError } from '../../shared/errors.ts';

const REFRESH_TTL_DAYS = 90;

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  email_verified: boolean;
  created_at: Date;
};

function toPublicUser(u: typeof users.$inferSelect): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar_url: u.avatarUrl,
    email_verified: u.emailVerified,
    created_at: u.createdAt,
  };
}

async function issueSession(
  db: Db,
  userId: string,
  deviceHint?: string,
  ip?: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const refresh = generateRefreshToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashRefreshToken(refresh),
      deviceHint: deviceHint ?? null,
      ipAddress: ip ?? null,
      expiresAt: refreshExpiry(),
    })
    .returning();
  const access = await signAccessToken(userId, session.id);
  return { access_token: access, refresh_token: refresh };
}

export function createAuthService(db: Db) {
  return {
    async register(input: {
      email: string;
      password: string;
      name: string;
      deviceHint?: string;
      ip?: string;
    }) {
      const email = input.email.toLowerCase().trim();
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      if (existing.length > 0) {
        throw new AppError('CONFLICT', 'Email already registered');
      }
      const passwordHash = await hashPassword(input.password);
      const [user] = await db
        .insert(users)
        .values({ email, name: input.name, passwordHash, emailVerified: false })
        .returning();
      // Default settings row.
      await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
      const tokens = await issueSession(db, user.id, input.deviceHint, input.ip);
      return { ...tokens, user: toPublicUser(user) };
    },

    async login(input: { email: string; password: string; deviceHint?: string; ip?: string }) {
      const email = input.email.toLowerCase().trim();
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      // Constant-ish: always run a verify to reduce enumeration signal.
      const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$notarealsalt$notarealhashvalue';
      const okPw = await verifyPassword(hash, input.password);
      if (!user || !user.passwordHash || !okPw) {
        throw new AppError('UNAUTHORIZED', 'Invalid email or password');
      }
      const tokens = await issueSession(db, user.id, input.deviceHint, input.ip);
      return { ...tokens, user: toPublicUser(user) };
    },

    async refresh(input: { refresh_token: string; deviceHint?: string; ip?: string }) {
      const tokenHash = hashRefreshToken(input.refresh_token);
      const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
        .limit(1);
      if (!session) {
        throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
      }
      // Rotate: delete old single-use session, mint a new one.
      await db.delete(sessions).where(eq(sessions.id, session.id));
      const tokens = await issueSession(db, session.userId, input.deviceHint, input.ip);
      return tokens;
    },

    async logout(sessionId: string) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    },
  };
}
