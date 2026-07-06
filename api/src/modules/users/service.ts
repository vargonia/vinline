// Users service: me profile + settings.
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../shared/db/index.ts';
import { users, userSettings } from '../../shared/db/schema.ts';
import { AppError } from '../../shared/errors.ts';

function toPublicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar_url: u.avatarUrl,
    email_verified: u.emailVerified,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

export function createUsersService(db: Db) {
  return {
    async getMe(userId: string) {
      const [u] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
      if (!u) throw new AppError('NOT_FOUND', 'User not found');
      return toPublicUser(u);
    },

    async updateMe(userId: string, patch: { name?: string; avatar_url?: string | null }) {
      const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.avatar_url !== undefined) set.avatarUrl = patch.avatar_url;
      const [u] = await db
        .update(users)
        .set(set)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning();
      if (!u) throw new AppError('NOT_FOUND', 'User not found');
      return toPublicUser(u);
    },

    async getSettings(userId: string) {
      let [s] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
      if (!s) {
        [s] = await db.insert(userSettings).values({ userId }).returning();
      }
      return {
        margins: s.margins,
        naming_convention: s.namingConvention,
        updated_at: s.updatedAt,
      };
    },

    async putSettings(
      userId: string,
      input: { margins: unknown; naming_convention: unknown },
    ) {
      const [s] = await db
        .insert(userSettings)
        .values({
          userId,
          margins: input.margins as Record<string, unknown>,
          namingConvention: input.naming_convention as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            margins: input.margins as Record<string, unknown>,
            namingConvention: input.naming_convention as Record<string, unknown>,
            updatedAt: new Date(),
          },
        })
        .returning();
      return {
        margins: s.margins,
        naming_convention: s.namingConvention,
        updated_at: s.updatedAt,
      };
    },
  };
}
