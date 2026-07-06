// Drizzle schema — B1 subset: users, sessions, user_settings,
// wine_items, wine_lists, wine_list_entries.
// Column names/types faithful to backend-database-schema.md.
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('idx_users_email').on(t.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    deviceHint: text('device_hint'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index('idx_sessions_token_hash').on(t.tokenHash),
    userIdx: index('idx_sessions_user').on(t.userId, t.expiresAt),
  }),
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  margins: jsonb('margins').notNull().default({}),
  namingConvention: jsonb('naming_convention').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wineItems = pgTable(
  'wine_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id'),
    name: text('name').notNull(),
    vintage: text('vintage'),
    region: text('region'),
    size: text('size'),
    qtyBottles: integer('qty_bottles').notNull().default(0),
    costPerBottle: numeric('cost_per_bottle'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('idx_wine_items_user').on(t.userId),
  }),
);

export const wineLists = pgTable('wine_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const wineListEntries = pgTable(
  'wine_list_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wineListId: uuid('wine_list_id')
      .notNull()
      .references(() => wineLists.id, { onDelete: 'cascade' }),
    wineItemId: uuid('wine_item_id')
      .notNull()
      .references(() => wineItems.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    sellPriceBottle: numeric('sell_price_bottle'),
    sellPriceGlass: numeric('sell_price_glass'),
    btg: boolean('btg').notNull().default(false),
    category: text('category'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listIdx: index('idx_wine_list_entries_list').on(t.wineListId, t.sortOrder),
  }),
);
