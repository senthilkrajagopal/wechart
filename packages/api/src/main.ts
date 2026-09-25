import closeWithGrace from 'close-with-grace';

import { loadConfig } from './config';
import { closeDb, getDb } from './db/client';
import { migrateToLatest } from './db/migrate';
import { bookmarkStore } from './repos/bookmarks';
import { catalog } from './repos/catalog';
import { documents } from './repos/documents';
import { readModelDir } from './model/read-dir';
import { imageStore } from './repos/images';
import { modelFileStore } from './repos/model-files';
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

  /**
   * The model's files, seeded from the directory Cube reads (T137): a file
   * not yet in wechart's store is taken in; one already there is left as it
   * is, so a restart never writes over an edit.
   */
  const modelFiles = modelFileStore(db);
  await modelFiles.seed(await readModelDir(config.modelDir));

  const app = buildServer({
    config,
    queryLog: queryLog(db),
    catalog: catalog(db),
    documents: documents(db),
    images: imageStore(db),
    bookmarks: bookmarkStore(db),
    modelFiles,
    logger: true,
  });

  closeWithGrace({ delay: 5_000 }, async () => {
    await app.close();
    await closeDb();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

await main();
