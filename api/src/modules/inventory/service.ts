// Inventory service: wine_items CRUD + cursor pagination + soft delete.
import { and, eq, isNull, or, lt, desc } from 'drizzle-orm';
import type { Db } from '../../shared/db/index.ts';
import { wineItems } from '../../shared/db/schema.ts';
import { AppError } from '../../shared/errors.ts';
import { encodeCursor, decodeCursor } from '../../shared/reply.ts';

function toPublic(w: typeof wineItems.$inferSelect) {
  return {
    id: w.id,
    invoice_id: w.invoiceId,
    name: w.name,
    vintage: w.vintage,
    region: w.region,
    size: w.size,
    qty_bottles: w.qtyBottles,
    cost_per_bottle: w.costPerBottle,
    active: w.active,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}

export function createInventoryService(db: Db) {
  return {
    async list(
      userId: string,
      opts: { limit: number; cursor?: string; active?: boolean },
    ) {
      const conds = [eq(wineItems.userId, userId), isNull(wineItems.deletedAt)];
      if (opts.active !== undefined) conds.push(eq(wineItems.active, opts.active));
      if (opts.cursor) {
        const dc = decodeCursor(opts.cursor);
        if (!dc) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
        const cDate = new Date(dc.c);
        // keyset on (created_at, id) descending
        conds.push(
          or(
            lt(wineItems.createdAt, cDate),
            and(eq(wineItems.createdAt, cDate), lt(wineItems.id, dc.i)),
          )!,
        );
      }
      const rows = await db
        .select()
        .from(wineItems)
        .where(and(...conds))
        .orderBy(desc(wineItems.createdAt), desc(wineItems.id))
        .limit(opts.limit + 1);
      const hasMore = rows.length > opts.limit;
      const page = hasMore ? rows.slice(0, opts.limit) : rows;
      const last = page[page.length - 1];
      const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
      return {
        data: page.map(toPublic),
        meta: { limit: opts.limit, nextCursor, hasMore },
      };
    },

    async create(userId: string, input: Record<string, unknown>) {
      const [w] = await db
        .insert(wineItems)
        .values({
          userId,
          name: input.name as string,
          vintage: (input.vintage as string) ?? null,
          region: (input.region as string) ?? null,
          size: (input.size as string) ?? null,
          qtyBottles: (input.qty_bottles as number) ?? 0,
          costPerBottle:
            input.cost_per_bottle === undefined || input.cost_per_bottle === null
              ? null
              : String(input.cost_per_bottle),
          active: input.active === undefined ? true : (input.active as boolean),
        })
        .returning();
      return toPublic(w);
    },

    async get(userId: string, id: string) {
      const [w] = await db
        .select()
        .from(wineItems)
        .where(and(eq(wineItems.id, id), isNull(wineItems.deletedAt)))
        .limit(1);
      if (!w) throw new AppError('NOT_FOUND', 'Wine item not found');
      if (w.userId !== userId) throw new AppError('NOT_FOUND', 'Wine item not found');
      return toPublic(w);
    },

    async update(userId: string, id: string, patch: Record<string, unknown>) {
      await this.get(userId, id); // ownership + existence
      const set: Partial<typeof wineItems.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) set.name = patch.name as string;
      if (patch.vintage !== undefined) set.vintage = patch.vintage as string;
      if (patch.region !== undefined) set.region = patch.region as string;
      if (patch.size !== undefined) set.size = patch.size as string;
      if (patch.qty_bottles !== undefined) set.qtyBottles = patch.qty_bottles as number;
      if (patch.cost_per_bottle !== undefined)
        set.costPerBottle =
          patch.cost_per_bottle === null ? null : String(patch.cost_per_bottle);
      if (patch.active !== undefined) set.active = patch.active as boolean;
      const [w] = await db
        .update(wineItems)
        .set(set)
        .where(eq(wineItems.id, id))
        .returning();
      return toPublic(w);
    },

    async softDelete(userId: string, id: string) {
      await this.get(userId, id); // ownership + existence
      await db
        .update(wineItems)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(wineItems.id, id));
    },
  };
}
