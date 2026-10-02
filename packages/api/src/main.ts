import closeWithGrace from 'close-with-grace';

import { pgSessionStore } from './auth/session-store';
import { loadConfig } from './config';
import { serviceCredential } from './cube/service-token';
import { querySigner } from './cube/signing';
import { closeDb, getDb } from './db/client';
import { migrateToLatest } from './db/migrate';
import { bookmarkStore } from './repos/bookmarks';
import { catalog } from './repos/catalog';
import { connectionTestStore } from './repos/connection-tests';
import { dataSourceStore } from './repos/data-sources';
import { deletedFolderStore } from './repos/deleted-folders';
import { documents } from './repos/documents';
import { proposalBindingStore } from './repos/proposal-bindings';
import { folderXcubeIds } from './repos/folder-xcube-ids';
import { folderAccessStore } from './repos/folder-access';
import { auditStore } from './repos/audit';
import { sqlRunnerSwitches } from './repos/sql-runner-switches';
import { sqlRuns } from './repos/sql-runs';
import { AUDIT_RETENTION_DAYS, startAuditRetention } from './audit/retention';
import { readModelDir } from './model/read-dir';
import { startModel } from './model/split';
import { imageStore } from './repos/images';
import { modelFileStore } from './repos/model-files';
import { queryLog } from './repos/query-log';
import { checkXcubeHoldsKey, xcubePublicKeyOf } from './secrets/xcube-key';
import { xcubeAdmin } from './xcube/client';
import { startSigning, xcubeKeys } from './xcube/keys';
import { connectionSync, xcubeConnections } from './xcube/connections';
import { xcubeSqlRunner } from './xcube/sql-runner';
import { withAllowedGroups } from './xcube/folders';
import { publicationStore } from './xcube/publications';
import { modelSync } from './xcube/snapshot';
import { seedDevData } from './seed';
import { seedDefault } from './seed-default';
import { proposalStore } from './repos/proposals';
import { versionStore } from './repos/versions';
import { buildServer } from './server';

/**
 * The service entry point. Migrations run here for local development; in
 * production they are their own step before the API starts
 * (docs/research/db-access.md).
 */
/** The issuer every query token names, and the pushed key set requires (T437). */
const TOKEN_ISSUER = 'wechart';

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
  /**
   * wechart's service credential (T420, AC-326): every call of its own —
   * xcube's admin routes, the jobs API, introspection, the whole field list —
   * carries its token, never a user's, and xcube's static admin token no more.
   */
  const service =
    config.xcube === undefined
      ? undefined
      : await serviceCredential({
          privateKeyPem: config.xcube.serviceKey,
          model: config.xcube.model,
        });
  /**
   * The query signing keys (T437, AC-326): every query token is RS256 under
   * one once its public half is pushed to xcube, below; with a next key, the
   * rotation to it.
   */
  const signers =
    config.xcube === undefined
      ? undefined
      : {
          current: await querySigner({
            privateKeyPem: config.xcube.signingKey,
            issuer: TOKEN_ISSUER,
          }),
          ...(config.xcube.nextSigningKey === undefined
            ? {}
            : {
                next: await querySigner({
                  privateKeyPem: config.xcube.nextSigningKey,
                  issuer: TOKEN_ISSUER,
                }),
              }),
        };
  let signing: ReturnType<typeof startSigning> | undefined;
  const admin =
    config.xcube === undefined || service === undefined
      ? undefined
      : xcubeAdmin({
          cubeApiUrl: config.cubeApiUrl,
          model: config.xcube.model,
          token: () => service.token(),
        });
  // What xcube acknowledged: recorded by the sync, and read for every token (T421).
  const publications = publicationStore(db);
  // Each folder's stored xcube id, and the tree they make (T425).
  const folderIds = folderXcubeIds(db);
  // Each folder's AD groups (T314).
  const folderAccess = folderAccessStore(db);
  const sync =
    admin === undefined || config.xcube === undefined
      ? undefined
      : modelSync({
          model: config.xcube.model,
          admin,
          // Every folder's files, each its folder's item (T452).
          files: () => modelFiles.all(),
          // Each folder with its allowed groups, which xcube's folder gate
          // admits by, and the gate on with sign-in (T436, AC-320).
          tree: async () => {
            const tree = await folderIds.tree();
            const { ids } = await folderIds.published();
            return withAllowedGroups(tree, ids, await folderAccess.tree(), config.superAdminGroup);
          },
          security: config.security === 'oidc',
          folderIds: async () => (await folderIds.published()).ids,
          publications,
          log: {
            warn: (details, message) => app.log.warn(details, message),
            info: (details, message) => app.log.info(details, message),
          },
        });
  const dataSources = dataSourceStore(db, { kid: config.xcubePublicKey.kid });
  /**
   * Each folder's data source landed in xcube as a connection, before wechart
   * commits it (T442, AC-327): a new folder's tree put first.
   */
  const connections =
    config.xcube === undefined || service === undefined
      ? undefined
      : xcubeConnections({
          cubeApiUrl: config.cubeApiUrl,
          model: config.xcube.model,
          token: () => service.token(),
        });
  const landing =
    connections === undefined || sync === undefined
      ? undefined
      : connectionSync({
          connections,
          folders: () => folderIds.published(),
          pushTree: () => sync.pushTree('folder'),
        });
  const runStore = sqlRuns(db);
  const app = buildServer({
    config,
    queryLog: queryLog(db),
    catalog: catalog(db),
    documents: documents(db),
    images: imageStore(db),
    bookmarks: bookmarkStore(db),
    modelFiles,
    ...(sync === undefined
      ? {}
      : {
          // Its changeset, as the check had it; else the whole model (T426).
          afterPublish: (changeset) => sync.publish(changeset),
          // The tree put after every folder change (T449, AC-333).
          afterFolderChange: () => sync.pushTree('folder'),
          // And before a publish into a folder, which xcube's tree must hold
          // (T452). A push that failed is said, and the check then says why.
          beforeFolderPublish: async () => {
            if ((await sync.pushTree('publish')).kind === 'failed')
              throw new Error('xcube’s folder tree could not be put before a publish');
          },
        }),
    // Where each folder's model files are published (T452).
    folders: () => folderIds.published(),
    ...(admin === undefined ? {} : { xcube: admin }),
    ...(service === undefined ? {} : { serviceToken: () => service.token() }),
    // RS256 under the pushed key, once pushed (T437, AC-326).
    ...(signers === undefined ? {} : { querySigner: () => signing?.signer() }),
    publications,
    // Each folder's AD groups (T314).
    folderAccess,
    // Each shared folder deleted, kept to make it again at an approval (T540, AC-389).
    deletedFolders: deletedFolderStore(db),
    // The audit trail (T368, AC-294).
    audit: auditStore(db),
    // Workspace items proposed to their target folders (T349, AC-284).
    proposals: proposalStore(db),
    // What each proposal's items bound to when made, held to at approval (T456, AC-321).
    proposalBindings: proposalBindingStore(db),
    // The versions of what approvals land, kept (T352, AC-288).
    versions: versionStore(db),
    // Data sources as folder items, their secrets sealed (T335).
    dataSources,
    // The SQL runner's switch per data source, and Cube Store's (T531, AC-374).
    sqlRunnerSwitches: sqlRunnerSwitches(db),
    // Each user's SQL runs, one going at a time (T533, AC-379), kept as their history (T534).
    sqlRuns: runStore,
    // Read-only SQL run by xcube, on a data source's connection (T532, AC-373).
    ...(config.xcube === undefined || service === undefined
      ? {}
      : {
          sqlRunner: xcubeSqlRunner({
            cubeApiUrl: config.cubeApiUrl,
            model: config.xcube.model,
            token: () => service.token(),
          }),
        }),
    ...(landing === undefined
      ? {}
      : {
          dataSourceLanding: {
            prepare: (folderId) => landing.prepare(folderId),
            unland: (source) => landing.unland(source),
          },
          // Whether every Cube instance uses its settings (T365, AC-161).
          connectionHealth: (source) => landing.healthOf(source),
        }),
    // Connection tests, run by xcube with Cube's own drivers (T361, AC-159),
    // and each one of a stored data source kept (T362, AC-163).
    ...(connections === undefined ? {} : { connectionTest: (body) => connections.test(body) }),
    connectionTests: connectionTestStore(db),
    // Signed-in sessions, kept in the metadata database (T316).
    sessions,
    logger: true,
  });
  for (const message of splits) app.log.info(message);

  // xcube holds the key credentials are sealed to, or the API doesn't start
  // (T455, AC-324): waited for while xcube can't be reached.
  if (service !== undefined)
    await checkXcubeHoldsKey({
      cubeApiUrl: config.cubeApiUrl,
      key: config.xcubePublicKey,
      token: () => service.anyModelToken(),
      onWait: (why) => app.log.warn(`${why}: waiting to check xcube’s credential keys`),
    });

  // The query keys pushed before anything is served (T437, AC-326): from
  // then on the model takes RS256 tokens only. Waited for while xcube can't
  // be reached; a newer set without our key stops the start.
  if (signers !== undefined && service !== undefined && config.xcube !== undefined) {
    signing = startSigning({
      ...signers,
      keys: xcubeKeys({
        cubeApiUrl: config.cubeApiUrl,
        model: config.xcube.model,
        issuer: TOKEN_ISSUER,
        token: () => service.token(),
        onWait: (why) => app.log.warn(`${why}: waiting to push the query keys`),
      }),
      warn: (message, error) => app.log.warn({ err: error }, message),
    });
    await signing.ready;
    app.log.info({ kid: signing.signer()?.kid }, 'query keys pushed to xcube');
  }

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
          // The tree too, so a push lost with xcube away is made (T449's review).
          void sync.pushTree('reconcile').then(() => sync.sync('reconcile'));
        }, 60_000);
  reconciling?.unref();
  // The tree first, then the items (T449): a model xcube holds as a file set
  // is moved to items mode by this first send. Between them, the data sources
  // xcube lacks or holds otherwise (T442, AC-330), so an item bound to one
  // finds its connection there.
  void sync
    ?.pushTree('start')
    .then(async () => {
      if (landing === undefined) return;
      const report = await landing.reconcile(dataSources).catch((error: unknown) => {
        app.log.warn({ err: error }, 'could not bring xcube’s connections up to wechart’s');
        return undefined;
      });
      if (report === undefined) return;
      const said = 'xcube’s connections brought up to wechart’s';
      // A secret xcube can't open, or a connection it refused: said as a warning.
      if (report.unopened.length + report.failed.length > 0) app.log.warn(report, said);
      else if (report.put.length + report.removed.length > 0) app.log.info(report, said);
    })
    .then(() => sync.sync('start'));

  // Audit records past the retention removed, at once and hourly (T370, AC-296).
  const stopRetention = startAuditRetention(auditStore(db), {
    days: config.auditRetentionDays ?? AUDIT_RETENTION_DAYS,
    onError: (error) => {
      app.log.warn({ err: error }, 'could not remove audit records past the retention');
    },
  });
  // And each user's SQL runs, kept as long as audit records are (T534, AC-381).
  const stopRunRetention = startAuditRetention(runStore, {
    days: config.auditRetentionDays ?? AUDIT_RETENTION_DAYS,
    onError: (error) => {
      app.log.warn({ err: error }, 'could not remove SQL runs past the retention');
    },
  });

  // Stopped, it finishes the requests under way, taking no new ones (Fastify's
  // `close()`), for up to 15 s: past a query's 10 s long-poll on Cube, which
  // 5 s cut off (T423, AC-319; research cube/ha-topology.md §4). The chart's
  // grace period is longer.
  closeWithGrace({ delay: 15_000 }, async () => {
    stopRetention();
    stopRunRetention();
    clearInterval(sweeping);
    if (reconciling !== undefined) clearInterval(reconciling);
    await app.close();
    await closeDb();
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

// The install Job's one-shot, in this image (T443, AC-310): no server, no database.
if (process.argv[2] === 'seed-default') process.exit(await seedDefault(process.env));
else await main();
