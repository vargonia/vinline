// Entry point: create DB (driver duality), migrate, build app, listen.
import { createDb, runMigrations } from './shared/db/index.ts';
import { buildApp } from './app.ts';

async function main() {
  const pgliteDir = process.env.DATABASE_URL ? undefined : process.env.PGLITE_DIR ?? './.data';
  const handle = await createDb({ pgliteDir });
  await runMigrations(handle);

  const app = await buildApp(handle);
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`vinline API listening on http://${host}:${port} (driver=${handle.driver})`);

  const shutdown = async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal boot error:', err);
  process.exit(1);
});
