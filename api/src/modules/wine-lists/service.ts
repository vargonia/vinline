// Wine-lists service: lists CRUD (soft delete) + entries add/patch/delete/reorder.
// Ownership enforced at the list level; entries inherit the list's owner.
import { and, eq, isNull, asc } from 'drizzle-orm';
import type { Db } from '../../shared/db/index.ts';
import { wineLists, wineListEntries, wineItems } from '../../shared/db/schema.ts';
import { AppError } from '../../shared/errors.ts';

function toPublicList(l: typeof wineLists.$inferSelect) {
  return {
    id: l.id,
    name: l.name,
    status: l.status,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

function toPublicEntry(e: typeof wineListEntries.$inferSelect) {
  return {
    id: e.id,
    wine_list_id: e.wineListId,
    wine_item_id: e.wineItemId,
    display_name: e.displayName,
    sell_price_bottle: e.sellPriceBottle,
    sell_price_glass: e.sellPriceGlass,
    btg: e.btg,
    category: e.category,
    sort_order: e.sortOrder,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function createWineListsService(db: Db) {
  async function ownedList(userId: string, id: string) {
    const [l] = await db
      .select()
      .from(wineLists)
      .where(and(eq(wineLists.id, id), isNull(wineLists.deletedAt)))
      .limit(1);
    if (!l || l.userId !== userId) throw new AppError('NOT_FOUND', 'Wine list not found');
    return l;
  }

  async function ownedEntry(userId: string, listId: string, entryId: string) {
    await ownedList(userId, listId);
    const [e] = await db
      .select()
      .from(wineListEntries)
      .where(and(eq(wineListEntries.id, entryId), eq(wineListEntries.wineListId, listId)))
      .limit(1);
    if (!e) throw new AppError('NOT_FOUND', 'Entry not found');
    return e;
  }

  return {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(wineLists)
        .where(and(eq(wineLists.userId, userId), isNull(wineLists.deletedAt)))
        .orderBy(asc(wineLists.createdAt));
      return rows.map(toPublicList);
    },

    async create(userId: string, input: { name: string; status?: string }) {
      const [l] = await db
        .insert(wineLists)
        .values({ userId, name: input.name, status: input.status ?? 'draft' })
        .returning();
      return toPublicList(l);
    },

    async get(userId: string, id: string) {
      const l = await ownedList(userId, id);
      const entries = await db
        .select()
        .from(wineListEntries)
        .where(eq(wineListEntries.wineListId, id))
        .orderBy(asc(wineListEntries.sortOrder), asc(wineListEntries.createdAt));
      return { ...toPublicList(l), entries: entries.map(toPublicEntry) };
    },

    async update(userId: string, id: string, patch: { name?: string; status?: string }) {
      await ownedList(userId, id);
      const set: Partial<typeof wineLists.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.status !== undefined) set.status = patch.status;
      const [l] = await db.update(wineLists).set(set).where(eq(wineLists.id, id)).returning();
      return toPublicList(l);
    },

    async softDelete(userId: string, id: string) {
      await ownedList(userId, id);
      await db
        .update(wineLists)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(wineLists.id, id));
    },

    async addEntry(userId: string, listId: string, input: Record<string, unknown>) {
      await ownedList(userId, listId);
      // wine_item must belong to the same user and exist.
      const wineItemId = input.wine_item_id as string;
      const [wi] = await db
        .select({ id: wineItems.id, userId: wineItems.userId, deletedAt: wineItems.deletedAt })
        .from(wineItems)
        .where(eq(wineItems.id, wineItemId))
        .limit(1);
      if (!wi || wi.userId !== userId || wi.deletedAt) {
        throw new AppError('NOT_FOUND', 'Wine item not found');
      }
      const [e] = await db
        .insert(wineListEntries)
        .values({
          wineListId: listId,
          wineItemId,
          displayName: (input.display_name as string) ?? null,
          sellPriceBottle:
            input.sell_price_bottle === undefined || input.sell_price_bottle === null
              ? null
              : String(input.sell_price_bottle),
          sellPriceGlass:
            input.sell_price_glass === undefined || input.sell_price_glass === null
              ? null
              : String(input.sell_price_glass),
          btg: input.btg === undefined ? false : (input.btg as boolean),
          category: (input.category as string) ?? null,
          sortOrder: (input.sort_order as number) ?? 0,
        })
        .returning();
      return toPublicEntry(e);
    },

    async updateEntry(
      userId: string,
      listId: string,
      entryId: string,
      patch: Record<string, unknown>,
    ) {
      await ownedEntry(userId, listId, entryId);
      const set: Partial<typeof wineListEntries.$inferInsert> = { updatedAt: new Date() };
      if (patch.display_name !== undefined) set.displayName = patch.display_name as string;
      if (patch.sell_price_bottle !== undefined)
        set.sellPriceBottle =
          patch.sell_price_bottle === null ? null : String(patch.sell_price_bottle);
      if (patch.sell_price_glass !== undefined)
        set.sellPriceGlass =
          patch.sell_price_glass === null ? null : String(patch.sell_price_glass);
      if (patch.btg !== undefined) set.btg = patch.btg as boolean;
      if (patch.category !== undefined) set.category = patch.category as string;
      if (patch.sort_order !== undefined) set.sortOrder = patch.sort_order as number;
      const [e] = await db
        .update(wineListEntries)
        .set(set)
        .where(eq(wineListEntries.id, entryId))
        .returning();
      return toPublicEntry(e);
    },

    async deleteEntry(userId: string, listId: string, entryId: string) {
      await ownedEntry(userId, listId, entryId);
      await db.delete(wineListEntries).where(eq(wineListEntries.id, entryId));
    },

    async reorder(userId: string, listId: string, order: string[]) {
      await ownedList(userId, listId);
      // All ids must belong to this list.
      const existing = await db
        .select({ id: wineListEntries.id })
        .from(wineListEntries)
        .where(eq(wineListEntries.wineListId, listId));
      const existingIds = new Set(existing.map((r) => r.id));
      for (const id of order) {
        if (!existingIds.has(id)) {
          throw new AppError('VALIDATION_ERROR', `Entry ${id} not in this list`);
        }
      }
      // Apply sort_order per position.
      for (let i = 0; i < order.length; i++) {
        await db
          .update(wineListEntries)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(eq(wineListEntries.id, order[i]));
      }
      const entries = await db
        .select()
        .from(wineListEntries)
        .where(eq(wineListEntries.wineListId, listId))
        .orderBy(asc(wineListEntries.sortOrder), asc(wineListEntries.createdAt));
      return entries.map(toPublicEntry);
    },
  };
}
