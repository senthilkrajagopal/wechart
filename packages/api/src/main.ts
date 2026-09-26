import closeWithGrace from 'close-with-grace';

import { pgSessionStore } from './auth/session-store';
import { loadConfig } from './config';
import { closeDb, getDb } from './db/client';
import { migrateToLatest } from './db/migrate';
import { bookmarkStore } from './repos/bookmarks';
import { catalog } from './repos/catalog';
import { documents } from './repos/documents';
import { folderAccessStore } from './repos/folder-access';
import { readModelDir } from './model/read-dir';
import { startModel } from './model/split';
import { imageStore } from './repos/images';
import { modelFileStore } from './repos/model-files';
import { queryLog } from './repos/query-log';
import { xcubePublicKeyOf } from './secrets/xcube-key';
import { xcubeAdmin } from './xcube/client';
import { publicationStore } from './xcube/publications';
import { modelSync } from './xcube/snapshot';
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
  // One cube or view per file (T448, AC-337): what the store holds split,
  // then the directory's files seeded split, so none is taken in whole or
  // twice. Said in the app's log once there is one.
  const splits: string[] = [];
  await startModel(modelFiles, await readModelDir(config.modelDir), (message) =>
    splits.push(message),
  );

  const sessions = pgSessionStore(db);
  /**
   * xcube's copy of the model (T419, AC-333): sent at start, after each
   * publish and every 60 s, where the deployment names its model in xcube.
   * The same admin client checks each publish first (T445).
   */
  const admin =
    config.xcube === undefined
      ? undefined
      : xcubeAdmin({
          cubeApiUrl: config.cubeApiUrl,
          model: config.xcube.model,
          token: config.xcube.adminToken,
        });
  // What xcube acknowledged: recorded by the sync, and read for every token (T421).
  const publications = publicationStore(db);
  const sync =
    admin === undefined || config.xcube === undefined
      ? undefined
      : modelSync({
          model: config.xcube.model,
          admin,
          files: () => modelFiles.list(),
          publications,
          log: {
            warn: (details, message) => app.log.warn(details, message),
            info: (details, message) => app.log.info(details, message),
          },
        });
  const app = buildServer({
    config,
    queryLog: queryLog(db),
    catalog: catalog(db),
    documents: documents(db),
    images: imageStore(db),
    bookmarks: bookmarkStore(db),
    modelFiles,
    ...(sync === undefined ? {} : { afterPublish: () => sync.sync('publish') }),
    ...(admin === undefined ? {} : { xcube: admin }),
    publications,
    // Each folder's AD groups (T314).
    folderAccess: folderAccessStore(db),
    // Signed-in sessions, kept in the metadata database (T316).
    sessions,
    logger: true,
  });
  for (const message of splits) app.log.info(message);

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

  // Sent at start, and reconciled every 60 s: a send lost between wechart's
  // commit and xcube is made then (T419, AC-333). Neither holds up the start.
  const reconciling =
    sync === undefined
      ? undefined
      : setInterval(() => {
          void sync.sync('reconcile');
        }, 60_000);
  reconciling?.unref();
  void sync?.sync('start');

  // Stopped, it finishes the requests under way, taking no new ones (Fastify's
  // `close()`), for up to 15 s: past a query's 10 s long-poll on Cube, which
  // 5 s cut off (T423, AC-319; research cube/ha-topology.md §4). The chart's
  // grace period is longer.
  closeWithGrace({ delay: 15_000 }, async () => {
    clearInterval(sweeping);
    if (reconciling !== undefined) clearInterval(reconciling);
    await app.close();
    await closeDb();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

await main();
