import closeWithGrace from 'close-with-grace';

import { pgSessionStore } from './auth/session-store';
import { loadConfig } from './config';
import { closeDb, getDb } from './db/client';
import { migrateToLatest } from './db/migrate';
import { bookmarkStore } from './repos/bookmarks';
import { catalog } from './repos/catalog';
import { documents } from './repos/documents';
import { folderAccessStore } from './repos/folder-access';
import { publishDraftStore } from './model/drafts';
import { readModelDir } from './model/read-dir';
import { imageStore } from './repos/images';
import { modelFileStore } from './repos/model-files';
import { queryLog } from './repos/query-log';
import { xcubePublicKeyOf } from './secrets/xcube-key';
import { seedDevData } from './seed';
import { buildServer } from './server';

/**
 * The service entry point. Migrations run here for local development; in
 * production they are their own step before the API starts
 * (docs/research/db-access.md).
 */
async function main(): Promise<void> {
  const config = {
    ...loadConfig(),
    // Before anything else is touched: without it, no credential could be
    // taken, and the API refuses to start (T333, AC-324).
    xcubePublicKey: xcubePublicKeyOf(process.env),
  };
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

  const sessions = pgSessionStore(db);
  const app = buildServer({
    config,
    queryLog: queryLog(db),
    catalog: catalog(db),
    documents: documents(db),
    images: imageStore(db),
    bookmarks: bookmarkStore(db),
    modelFiles,
    // Publish drafts, for whichever replica Cube's read-back reaches (T418).
    drafts: publishDraftStore(db),
    // Each folder's AD groups (T314).
    folderAccess: folderAccessStore(db),
    // Signed-in sessions, kept in the metadata database (T316).
    sessions,
    logger: true,
  });

  // Expired sessions are swept out: Postgres has no TTL (T316's review).
  const sweeping = setInterval(
    () => {
      sessions.sweep().catch((error: unknown) => {
        app.log.warn({ err: error }, 'could not sweep expired sessions');
      });
    },
    15 * 60 * 1000,
  );
  sweeping.unref();

  closeWithGrace({ delay: 5_000 }, async () => {
    clearInterval(sweeping);
    await app.close();
    await closeDb();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

await main();
