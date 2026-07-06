// DB factory + programmatic migrator.
// DATABASE_URL present  → drizzle-orm/node-postgres (pg)
// DATABASE_URL absent    → drizzle-orm/pglite (@electric-sql/pglite)
//   - test:  memory://  (in-memory)
//   - dev:   ./.data     (file-backed)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from './schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
// api/drizzle relative to api/src/shared/db
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'drizzle');

export type Db = Awaited<ReturnType<typeof createDb>>['db'];

export async function createDb(opts?: { url?: string; pgliteDir?: string }) {
  const url = opts?.url ?? process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    const close = async () => {
      await pool.end();
    };
    return { db, driver: 'pg' as const, close, _raw: pool };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dataDir = opts?.pgliteDir ?? process.env.PGLITE_DIR ?? 'memory://';
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzle(client, { schema });
  const close = async () => {
    await client.close();
  };
  return { db, driver: 'pglite' as const, close, _raw: client };
}

export async function runMigrations(
  handle: Awaited<ReturnType<typeof createDb>>,
): Promise<void> {
  if (handle.driver === 'pg') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(handle.db as never, { migrationsFolder: MIGRATIONS_DIR });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(handle.db as never, { migrationsFolder: MIGRATIONS_DIR });
  }
}

export { schema };
