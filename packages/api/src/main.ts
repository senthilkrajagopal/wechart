import closeWithGrace from 'close-with-grace';

import { loadConfig } from './config';
import { closeDb, getDb } from './db/client';
import { migrateToLatest } from './db/migrate';
import { catalog } from './repos/catalog';
import { documents } from './repos/documents';
import { queryLog } from './repos/query-log';
import { seedDevData } from './seed';
import { buildServer } from './server';

/**
 * The service entry point. Migrations run here for local development; in
 * production they are their own step before the API starts
 * (docs/research/db-access.md).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  await migrateToLatest();

  const db = getDb();
  if (process.env['WECHART_SEED'] === '1') await seedDevData(db);

  const app = buildServer({
    config,
    queryLog: queryLog(db),
    catalog: catalog(db),
    documents: documents(db),
    logger: true,
  });

  closeWithGrace({ delay: 5_000 }, async () => {
    await app.close();
    await closeDb();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

await main();
