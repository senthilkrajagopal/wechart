import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  ChartDocumentError,
  folderRights,
  IMAGE_HEAD_BYTES,
  imageProblem,
  newDashboardBody,
  objectsOf,
  type AccessFolder,
  type ChartDefinition,
  type FieldValue,
  type FolderRight,
  type SealedV1,
} from '@wechart/core';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import {
  CACHE_POLICIES,
  CubeClient,
  CubeError,
  CubeUnreachable,
  previewClaimsOf,
  type CachePolicy,
} from './cube/client';
import { authCheckOf } from './cube/authCheck';
import type { QuerySigner } from './cube/signing';
import { namedGroups } from './cube/named-groups';
import {
  cubesOfChartBody,
  cubesOfDashboardBody,
  cubesOnPath,
  cubesQueried,
  queryItemOf,
  queryItemOfParam,
  type QueryItem,
} from './access/queries';
import { scopesOf } from './cube/scopes';
import { healthOf, originOf } from './cube/health';
import { MetaCache, MetaCachesByGroups } from './cube/meta-cache';
import { missOf, rollupsFrom, titlesFrom, type Transformed } from './cube/preaggMatch';
import type { SessionStore } from '@fastify/session';

import { ADMIN, PUBLIC, registerGuard, registerRouteAccess, USER } from './auth/guard';
import { registerSignIn, signInOptionsOf } from './auth/routes';
import { Forbidden, registerUser, Unauthenticated, userOf } from './auth/user';
import { registerBuilds } from './jobs/build';
import { registerSchedules } from './jobs/schedules';
import { NO_JOBS, type JobsAccess } from './jobs/scope';
import {
  bindChart,
  bindNames,
  chartRenamed,
  cubesOfDashboard,
  dashboardRenamed,
} from './model/bind';
import { registerIntrospection } from './model/introspection';
import type { Config } from './config';
import type { Changeset } from './xcube/changesets';
import { XcubeError, type XcubeAdmin } from './xcube/client';
import { ROOT_ONLY, type PublishedFolders } from './xcube/folders';
import { cubesUsing, extendsIn } from './xcube/used-by';
import { declaredIn } from './model/split';
import type { PublicationStore } from './xcube/publications';
import { registerModelPublishing } from './model/publish';
import { referencesOf, usersOfCubes, type ReferenceDocument } from './model/references';
import { searchable, visibleCounts, type Visibility } from './access/visible';
import { aliasIn, aliasOut } from './access/workspace-alias';
import type { BookmarkStore } from './repos/bookmarks';
import {
  isWorkspaceId,
  MY_WORKSPACE_ID,
  ROOT_FOLDER_ID,
  workspaceIdOf,
  type OwnCounts,
} from './repos/catalog';

/** Its owner's right to their own workspace (T343): every item, theirs to change. */
const OWN_WORKSPACE: FolderRight = Object.freeze({ see: true, write: true, kinds: 'all' });
import type { ConnectionTestStore } from './repos/connection-tests';
import { DataSourceRefused, type DataSource, type DataSourceStore } from './repos/data-sources';
import type { DataSourceLanding } from './routes/data-sources';
import {
  connectionNameOf,
  type ConnectionHealth,
  type TestAnswer,
  type TestedConnection,
} from './xcube/connections';
import type { FolderAccessStore } from './repos/folder-access';
import type { AuditStore } from './repos/audit';
import { actorOf, recordIn } from './audit/record';
import { registerFolderAccess } from './routes/access';
import { registerAudit } from './routes/audit';
import { registerDataSources } from './routes/data-sources';
import { registerExport } from './routes/export';
import { sharedInPlace } from './routes/shared-in-place';
import { registerImport } from './routes/import';
import { registerProposals } from './routes/proposals';
import type { ProposalStore } from './repos/proposals';
import type { VersionStore } from './repos/versions';
import {
  chartCopy,
  dashboardCopies,
  type ShownCopy,
  withChartsRenamed,
} from './routes/workspace-copy';
import type { QueryLogEntry, QueryLogPageAsk } from './repos/query-log';

/**
 * The wechart API. The browser talks only to this, and this is the only thing
 * that talks to Cube (AC-007).
 */
export interface BuildOptions {
  readonly config: Config;
  readonly cube?: CubeClient;
  readonly metaCache?: MetaCache;
  /** Omitted only in tests that are not about the log itself. */
  readonly queryLog?: QueryLogWriter;
  readonly catalog?: CatalogReader;
  readonly documents?: DocumentWriter;
  /** Images added to dashboards' image tiles (AC-063). */
  readonly images?: ImageStore;
  /** Dashboards' bookmarks (T127, AC-121). */
  readonly bookmarks?: BookmarkStore;
  /** The Cube model's files (T137, AC-131). */
  readonly modelFiles?: ModelFileStore;
  /**
   * After a publish is committed to the model's store: send the whole set to
   * xcube (T419, AC-333). A send that fails leaves the publish standing, for
   * the next reconcile to send.
   */
  readonly afterPublish?: (changeset?: Changeset) => Promise<unknown>;
  /**
   * After a folder is made, changed, moved or removed: put the folder tree
   * to xcube (T449, AC-333). It answers for itself; nothing waits for it.
   */
  readonly afterFolderChange?: () => Promise<unknown>;
  /**
   * The folders xcube's tree holds, each with its xcube id and parent
   * (T452): where a folder's model files are published. The root alone
   * where not given.
   */
  readonly folders?: () => Promise<PublishedFolders>;
  /**
   * Before a publish into a folder other than the root: the tree put to
   * xcube, so a folder made a moment ago is one it holds (T452).
   */
  readonly beforeFolderPublish?: () => Promise<unknown>;
  /** xcube's admin routes, for its check of a publish (T445), where xcube is configured. */
  readonly xcube?: XcubeAdmin;
  /**
   * The service credential's token (T420, AC-326): what wechart's own calls
   * to Cube carry — jobs, introspection, the whole model's field list.
   */
  readonly serviceToken?: () => Promise<string>;
  /**
   * The query signer, once its key is pushed to xcube (T437, AC-326): every
   * query token is then RS256 under it (`cube/signing.ts`).
   */
  readonly querySigner?: () => QuerySigner | undefined;
  /**
   * What xcube last acknowledged of each model (T419), read for the revision
   * every token to Cube names and the field list follows (T421, AC-334).
   */
  readonly publications?: PublicationStore;
  /** Signed-in sessions, with security on (T316): the metadata database. */
  readonly sessions?: SessionStore;
  /** Each folder's AD groups (T314, AC-259, AC-260). */
  readonly folderAccess?: FolderAccessStore;
  /** The audit trail (T368, AC-294): where sign-ins and changes are recorded. */
  readonly audit?: AuditStore;
  /** Workspace items proposed to their target folders (T349, AC-284). */
  readonly proposals?: ProposalStore;
  /** The versions of what approvals land, kept (T352, AC-288). */
  readonly versions?: VersionStore;
  /** Data sources as folder items, their secrets sealed (T335, AC-269). */
  readonly dataSources?: DataSourceStore;
  /**
   * Where a data source lands before it is stored, and leaves before it is
   * removed (T442): xcube's connections. Unset without xcube.
   */
  readonly dataSourceLanding?: DataSourceLanding;
  /** xcube's connection test (T361, AC-159). Unset without xcube: a test says it needs it. */
  readonly connectionTest?: (body: TestedConnection) => Promise<TestAnswer>;
  /** Each connection test of a stored data source, kept (T362, AC-163). */
  readonly connectionTests?: ConnectionTestStore;
  /** A data source's Cube instances' reports, from xcube (T365, AC-161). */
  readonly connectionHealth?: (source: DataSource) => Promise<ConnectionHealth | undefined>;
  /**
   * How Cube's unauthenticated probes — its health (T162), whether it
   * enforces auth (T175) — are asked; `fetch` unless a test says.
   */
  readonly healthFetch?: typeof fetch;
  readonly logger?: boolean;
  /** How long before a "Continue wait" is asked again (T145); a second unless a test says. */
  readonly introspectionRetryMs?: number;
}

/**
 * One model file: its path under the model directory, and its text. It sits
 * in a folder (T334, AC-269), the shared root where none is named; the same
 * path in two folders is two files.
 */
export interface ModelFile {
  readonly folderId?: string;
  readonly path: string;
  readonly content: string;
}

/** Where the Cube model's files are kept (T137). */
export interface ModelFileStore {
  /** One folder's files, the shared root's where none is named (T334). */
  list(folderId?: string): Promise<readonly ModelFile[]>;
  /** Every folder's files: the whole model xcube is sent (T452). The root's where absent. */
  all?(): Promise<readonly ModelFile[]>;
  /** A file removed from its folder: a model item deleted (T428). */
  remove?(folderId: string, path: string): Promise<unknown>;
  /** Stores each file whose path is not stored yet; never writes over one that is. */
  seed(files: readonly ModelFile[]): Promise<unknown>;
  /** Stores each file, over the one at its path if there is one: a publish (T142). */
  write(files: readonly ModelFile[]): Promise<unknown>;
}

/** Where image tiles' images are kept: bytes, and the type they were accepted as. */
export interface ImageStore {
  add(input: {
    id: string;
    dashboardId: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<unknown>;
  /** Its bytes and type, and the dashboard it was added to (T408). */
  get(
    id: string,
  ): Promise<{ contentType: string; bytes: Buffer; dashboardId?: string } | undefined>;
}

/** The slice of the document repository the server writes through. */
export interface DocumentWriter {
  create(input: {
    kind: 'folder' | 'dashboard' | 'chart';
    id: string;
    body: Record<string, unknown>;
  }): Promise<{ id: string }>;
  relocate?(input: {
    kind: 'folder' | 'dashboard' | 'chart';
    id: string;
    title?: string;
    folderId?: string;
  }): Promise<unknown>;
  attachChart?(dashboardId: string, chartId: string): Promise<unknown>;
  remove?(kind: 'folder' | 'dashboard' | 'chart', id: string): Promise<boolean>;
  get?(
    kind: 'folder' | 'dashboard' | 'chart',
    id: string,
  ): Promise<{ id: string; body: Record<string, unknown>; version?: number } | null>;
  update?(input: {
    kind: 'folder' | 'dashboard' | 'chart';
    id: string;
    body: Record<string, unknown>;
    expectedVersion: number;
  }): Promise<unknown>;
  /** Several documents, all or nothing, in one transaction (AC-183). */
  updateTogether?(
    writes: readonly {
      kind: 'folder' | 'dashboard' | 'chart';
      id: string;
      body: Record<string, unknown>;
      expectedVersion: number;
    }[],
  ): Promise<readonly { id: string; version: number }[]>;
  /** Several made together, or none (T344's copies). */
  createTogether?(
    creates: readonly {
      kind: 'folder' | 'dashboard' | 'chart';
      id: string;
      body: Record<string, unknown>;
    }[],
  ): Promise<unknown>;
  /** The items of a kind copied from one (T344), in `inFolders` when given. */
  withOrigin?(
    kind: 'dashboard' | 'chart',
    originId: string,
    inFolders?: readonly string[],
  ): Promise<readonly { id: string; body: Record<string, unknown> }[]>;
  /** The charts local to a dashboard: what its version holds with it (T352). */
  localTo?(
    dashboardId: string,
  ): Promise<readonly { id: string; body: Record<string, unknown>; version: number }[]>;
  /** A folder's own item of a kind with this title, as a proposal would replace (T349). */
  named?(
    kind: 'dashboard' | 'chart',
    folderId: string,
    title: string,
  ): Promise<{ id: string; body: Record<string, unknown>; version: number } | null>;
}

/** The slice of the catalog repository the server exposes. */
export interface CatalogReader {
  /** `counted: false`: no counts, for a caller that counts what its user may see (T325). */
  folders(options?: { counted?: boolean }): Promise<unknown[]>;
  /** The shared root's and My workspace's item counts (AC-194). */
  rootCounts?(): Promise<Record<string, number>>;
  contents(folderId: string, options?: { counted?: boolean }): Promise<unknown[]>;
  search(
    text: string,
    limit?: number,
    only?: 'dashboard' | 'chart',
    /** With security on, the folders whose dashboards and library charts the user may find (T325). */
    within?: { readonly dashboards: readonly string[]; readonly charts: readonly string[] },
  ): Promise<unknown[]>;
  /** Each folder's own items by kind, for counts of what a user may see (T325, T331). */
  ownCounts?(): Promise<ReadonlyMap<string, OwnCounts>>;
  dashboardsUsing?(chartId: string): Promise<unknown[]>;
  /** The dashboards whose tiles show an image (T408). */
  dashboardsShowingImage?(imageId: string): Promise<readonly { folderId: string | null }[]>;
  /** Every chart and dashboard, with its body: what uses a member (T147). */
  referenceDocuments?(): Promise<readonly ReferenceDocument[]>;
}

/** The slice of the query-log repository the server uses. */
export interface QueryLogWriter {
  record(entry: QueryLogEntry): Promise<unknown>;
  /** Newest first; one user's only, when named (R42.6). */
  recent(limit?: number, userKey?: string): Promise<unknown[]>;
  /** The records of these request ids (T180). */
  /** Only one user's when named (T408). */
  byRequestIds?(requestIds: readonly string[], userKey?: string): Promise<unknown[]>;
  /** A page of the log, narrowed and sorted over all of it (T240). */
  page?(ask: QueryLogPageAsk): Promise<{ records: unknown[]; total: number }>;
}

/** The query log's time ranges, in seconds (AC-230). */
const WITHIN_SECONDS = { hour: 3_600, day: 86_400, week: 604_800 } as const;

export function buildServer({
  config,
  cube,
  metaCache,
  queryLog: log,
  catalog: cat,
  documents: docs,
  images,
  bookmarks,
  modelFiles,
  afterPublish,
  afterFolderChange,
  folders,
  beforeFolderPublish,
  xcube,
  serviceToken,
  querySigner,
  publications,
  folderAccess,
  dataSources,
  dataSourceLanding,
  connectionTest,
  connectionTests,
  connectionHealth,
  healthFetch,
  logger = false,
  introspectionRetryMs,
  sessions,
  audit,
  proposals,
  versions,
}: BuildOptions): FastifyInstance {
  const app = Fastify({
    logger,
    // Behind nginx, so `request.protocol` reads its X-Forwarded-Proto (T316's review).
    ...(config.trustProxy === undefined
      ? {}
      : {
          trustProxy:
            config.trustProxy === true ? true : [...(config.trustProxy as readonly string[])],
        }),
  });
  /**
   * A folder made, changed, moved or removed through any of the document
   * routes: the tree is put to xcube once the answer is sent (T449, AC-333).
   * So is a folder's groups saved, which change every allowed set above and
   * below it (T436, AC-320).
   */
  if (afterFolderChange !== undefined)
    app.addHook('onResponse', async (request, reply) => {
      // A write only: not a read, a HEAD included (T449's review).
      if (reply.statusCode >= 300 || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
        return;
      if (
        request.method === 'PUT' &&
        request.routeOptions.url === '/api/folders/:folderId/access'
      ) {
        void afterFolderChange().catch((error: unknown) => {
          app.log.warn({ err: error }, 'could not put the folder tree to xcube');
        });
        return;
      }
      if (!request.url.startsWith('/api/documents')) return;
      const kind =
        (request.params as { kind?: unknown } | undefined)?.kind ??
        (request.body as { kind?: unknown } | undefined)?.kind;
      if (kind !== 'folder') return;
      void afterFolderChange().catch((error: unknown) => {
        app.log.warn({ err: error }, 'could not put the folder tree to xcube');
      });
    });
  const security = config.security ?? 'off';
  // Before any route: every route declares who may call it (T318, AC-251).
  registerRouteAccess(app);
  if (security === 'oidc')
    registerSignIn(app, {
      ...signInOptionsOf(config, sessions),
      ...(audit === undefined ? {} : { audit }),
    });
  registerUser(app, security, config.superAdminGroup);
  registerGuard(app, security, config.publicUrl);
  /**
   * My workspace, `mine` to the client, is the signed-in user's own
   * `ws:<key>` (T343, AC-276), both ways: taken so in a route's folder, a
   * query's `folder` and every `folderId` a body carries, before any handler
   * reads them; and named `mine` in every JSON answer, so the client never
   * sees the stored id (its review). With security off it stays `mine`, the
   * single user's.
   */
  if (security !== 'off') {
    app.addHook('preHandler', async (request) => {
      const user = request.wechartUser;
      if (user === null || user === undefined) return;
      const own = workspaceIdOf(user.key);
      const params = request.params as Record<string, unknown> | undefined;
      if (params?.['folderId'] === MY_WORKSPACE_ID) params['folderId'] = own;
      const query = request.query as Record<string, unknown> | undefined;
      if (query?.['folder'] === MY_WORKSPACE_ID) query['folder'] = own;
      aliasIn(request.body, own);
    });
    app.addHook('onSend', async (request, reply, payload) => {
      const user = request.wechartUser;
      if (user === null || user === undefined || typeof payload !== 'string') return payload;
      if (!String(reply.getHeader('content-type') ?? '').includes('json')) return payload;
      return aliasOut(payload, workspaceIdOf(user.key));
    });
  }

  /**
   * Whether anyone is signed in, for the web server's `auth_request` (T321,
   * AC-251; research/openid-client.md, "nginx: gating page requests"): 204
   * or 401, and nothing else. With security off, the single user always is.
   */
  app.get('/api/auth/check', PUBLIC, async (request, reply) =>
    reply.code(request.wechartUser === null ? 401 : 204).send(),
  );

  /**
   * The Cube deployment's health and the refresh worker's state (T162,
   * AC-156), each from its own probes. Not `/api/health`, which is this API's
   * own, and which a deployment checks without asking Cube anything.
   */
  app.get('/api/cube-health', PUBLIC, async () =>
    healthOf(
      {
        cube: originOf(config.cubeApiUrl),
        ...(config.cubeWorkerUrl === undefined ? {} : { worker: config.cubeWorkerUrl }),
      },
      healthFetch,
    ),
  );
  /**
   * Whether Cube answers requests nobody signed (T175, AC-169): asked as
   * anyone could ask it, with no token and with a bad one — never with
   * wechart's.
   */
  // The Security workspace's: a Super-Admin's alone (T323, AC-265).
  app.get('/api/cube-auth', ADMIN, async () => authCheckOf(config.cubeApiUrl, healthFetch));
  /**
   * The model xcube serves this deployment, and the revision last recorded
   * for it, read as each request is signed (T421, AC-334): an answer comes
   * from that revision or a newer one, whichever replica recorded it.
   */
  const xcubeModel = config.xcube?.model;
  // The last revision read stands while the record can't be read: reading it
  // is never what breaks a chart (T421's review).
  let lastRevision: number | undefined;
  const model =
    xcubeModel === undefined || publications === undefined
      ? undefined
      : {
          id: xcubeModel,
          revision: async () => {
            try {
              lastRevision = (await publications.get(xcubeModel))?.revision;
            } catch (error) {
              app.log.warn({ err: error }, 'could not read the revision xcube acknowledged');
            }
            return lastRevision;
          },
        };
  const client =
    cube ??
    new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: config.cubeApiSecret,
      securityContext: config.securityContext,
      ...(model === undefined ? {} : { model }),
      ...(serviceToken === undefined ? {} : { service: serviceToken }),
      ...(querySigner === undefined ? {} : { signer: querySigner }),
    });

  // Metadata is cached with a 60-second freshness bound (AC-009), so a
  // dashboard opening many tiles issues one /v1/meta request, not one per tile;
  // and fetched again as soon as the recorded revision changes (T421).
  const metaOptions = model === undefined ? {} : { revision: model.revision };
  const meta = metaCache ?? new MetaCache({ fetchMeta: () => client.meta(), ...metaOptions });

  /**
   * Cube as a request's user asks it (T322, AC-008): with security on, the
   * configured context and exactly the user's AD groups, so the model's
   * access policies apply by group; with it off, as configured. What wechart
   * asks Cube for itself — compiling a publish, builds, schedules, a data
   * source's catalog, health — keeps the configured context.
   */
  /**
   * The groups a user's token may carry (T437, AC-008, AC-326): those some
   * policy in the model names, every group granted on a folder, and the
   * Super-Admin group (`cube/named-groups.ts`). Read where the folders'
   * groups are kept, as the deployment keeps them.
   */
  const named =
    security === 'oidc' && folderAccess !== undefined
      ? namedGroups({
          tree: () => folderAccess.tree(),
          files: async () => (await (modelFiles?.all ?? modelFiles?.list)?.call(modelFiles)) ?? [],
          revision: async () => model?.revision(),
          ...(config.superAdminGroup === undefined
            ? {}
            : { superAdminGroup: config.superAdminGroup }),
        })
      : undefined;
  const cubeFor = (request: FastifyRequest): CubeClient =>
    security === 'oidc' ? client.as({ groups: userOf(request).groups }, named) : client;
  // And metadata per set of groups: access policies hide members per group.
  const metaByGroups = new MetaCachesByGroups(
    (groups) =>
      new MetaCache({ fetchMeta: () => client.as({ groups }, named).meta(), ...metaOptions }),
  );
  const metaFor = (request: FastifyRequest): MetaCache =>
    security === 'oidc' ? metaByGroups.for(userOf(request).groups) : meta;
  /**
   * A previewed security context (T172, AC-166) stands in for the asker's
   * own, groups and all: with security on, a Super-Admin's alone (T322).
   */
  const previewOf = (request: FastifyRequest, value: unknown) => {
    if (value === undefined) return undefined;
    if (security === 'oidc' && !userOf(request).superAdmin) {
      throw new Forbidden('Only a Super-Admin can preview another security context.');
    }
    const context = previewClaimsOf(value);
    if (context === null) throw new BadRequest('A preview context is a JSON object.');
    // With sign-in on, a preview is as groups, and its token carries those
    // alone (AC-166 as amended; requirements "tokens carry groups only";
    // T438's review).
    if (security === 'oidc') {
      const groups = context['groups'];
      if (
        Object.keys(context).some((key) => key !== 'groups') ||
        !Array.isArray(groups) ||
        !groups.every((group) => typeof group === 'string')
      )
        throw new BadRequest('With sign-in on, a preview is as groups: send { groups: [...] }.');
    }
    return context;
  };

  /** Who ran a query, for the query log (R42.6): none with sign-in off. */
  const ranBy = (request: FastifyRequest): string | null =>
    security === 'off' ? null : userOf(request).key;

  /** Recording must never be what breaks a chart that loaded fine. */
  const record = async (entry: QueryLogEntry) => {
    try {
      await log?.record(entry);
    } catch (error) {
      app.log.warn({ err: error }, 'could not record query');
    }
  };

  app.get('/api/health', PUBLIC, () => ({ status: 'ok' }));

  /**
   * The field list, as the user's groups see it. Asked for an item,
   * `?for=<kind>:<id>` (T340, AC-268), it is that item's cubes and views
   * alone, and 404 for one the user may not open; asked for none, as before.
   */
  app.get('/api/meta', USER, async (request, reply) => {
    const raw = (request.query as { for?: unknown } | undefined)?.for;
    if (raw === undefined || security === 'off') return metaFor(request).meta();
    const item = queryItemOfParam(raw);
    if (item === null || item === undefined) throw new BadRequest();
    const scope = await queryScope(request, reply, item);
    if (scope === undefined) return reply;
    const meta = (await metaFor(request).meta()) as { cubes?: { name?: unknown }[] } | null;
    if (scope.allowed === 'all' || !Array.isArray(meta?.cubes)) return meta;
    const allowed = scope.allowed;
    return {
      ...meta,
      cubes: meta.cubes.filter((cube) => typeof cube.name === 'string' && allowed.has(cube.name)),
    };
  });

  /**
   * Who is signed in (AC-190, AC-252, AC-254): the name the top bar shows,
   * whether they are a Super-Admin, and the security mode, so the top bar can
   * show "Single-user mode" in place of Sign out.
   */
  app.get('/api/me', USER, async (request) => {
    const user = userOf(request);
    // A read-write member of some folder, who has data sources to see even
    // when none is there yet (T364's review); the one user with security off,
    // and a Super-Admin, are.
    const seen = await visibilityOf(request);
    const readWrite = seen === undefined || [...seen.rights.values()].some((right) => right.write);
    return {
      name: user.name,
      ...(user.identity === undefined ? {} : { identity: user.identity }),
      groups: user.groups,
      superAdmin: user.superAdmin,
      readWrite,
      security,
    };
  });

  /**
   * The Cube API scopes wechart's own context has (T176, AC-170), each probed
   * with its token by the cheapest request past the scope's assertion
   * (`cube/scopes.ts`; research/cube/api-scope-probes.md).
   */
  // Not admin (T323): Jobs' build panel asks it too, for read-write members;
  // and for no one without Jobs (T371's review).
  app.get('/api/cube-scopes', USER, async (request, reply) => {
    const scope = await jobsAccess.scope(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    return scopesOf(
      (path, init) => client.ask(path, init),
      // Jobs as wechart builds: with the service credential (T437, AC-326).
      (path, init) => client.ask(path, init, true),
    );
  });

  /**
   * A folder's model files, the shared root's where none is named, each with
   * its whole text and what it defines (T137, T334; AC-131): read by the
   * parser the model editor uses, so the two cannot disagree.
   *
   * With security on (T334; AC-262, AC-263, AC-264): only in a folder whose
   * every kind of item the user may see. A folder they can't see answers as
   * one that isn't there; the root, and a folder they see only dashboards
   * of, has none for them.
   */
  app.get('/api/model/files', USER, async (request, reply) => {
    const { folder, all } = request.query as { folder?: unknown; all?: unknown };
    const answered = (files: readonly ModelFile[]) => ({
      files: files.map((file) => ({
        folderId: file.folderId ?? ROOT_FOLDER_ID,
        path: file.path,
        content: file.content,
        ...objectsOf(file.path, file.content),
      })),
    });
    /**
     * Every folder's at once (T342, AC-141): what a save's edited members
     * are looked for across, since a view or an extending cube in another
     * folder exposes a member by that folder's name. Only folders whose every
     * kind of item the user may see, as one folder's are.
     */
    if (all === 'true') {
      const seenAll = await visibilityOf(request);
      const every = modelFiles ? await (modelFiles.all?.() ?? modelFiles.list()) : [];
      return answered(
        seenAll === undefined
          ? every
          : every.filter(
              (file) => seenAll.rights.get(file.folderId ?? ROOT_FOLDER_ID)?.kinds === 'all',
            ),
      );
    }
    const folderId = typeof folder === 'string' && folder !== '' ? folder : ROOT_FOLDER_ID;
    const seen = await visibilityOf(request);
    if (seen !== undefined) {
      const right = seen.rights.get(folderId);
      if (right === undefined && folderId !== ROOT_FOLDER_ID)
        return reply.code(404).send({ error: 'There’s no such folder, or it isn’t yours to see.' });
      if (right?.kinds !== 'all') return { files: [] };
    }
    return answered(modelFiles ? await modelFiles.list(folderId) : []);
  });

  registerModelPublishing(app, {
    config,
    client,
    // A publish is seen at once by every set of groups too (T322).
    meta: {
      invalidate: () => {
        meta.invalidate();
        metaByGroups.invalidate();
      },
    },
    modelFiles,
    // With security on, only in a folder they may write in (T334, AC-262,
    // AC-266): one they can't see answers as one that isn't there.
    refusalIn: async (request, folderId) => {
      const seen = await visibilityOf(request);
      if (seen === undefined || mayWrite(seen, folderId)) return undefined;
      // The root, and My workspace to one who has none, refuse as read-only (T343).
      const said = folderId === ROOT_FOLDER_ID || folderId === workspaceIdOf(userOf(request).key);
      return !said && !seen.rights.has(folderId)
        ? { status: 404, body: { error: 'There’s no such folder, or it isn’t yours to see.' } }
        : { status: 403, body: { error: READ_ONLY } };
    },
    ...(afterPublish === undefined ? {} : { afterPublish }),
    ...(xcube === undefined ? {} : { xcube }),
    ...(folders === undefined ? {} : { folders }),
    ...(beforeFolderPublish === undefined ? {} : { beforeFolderPublish }),
    // A refused publish's breaks named where the user sees the folder's
    // models, counted elsewhere, and all of them recorded (T427, AC-322).
    seesModelsIn: async (request) => {
      const seen = await visibilityOf(request);
      return (folderId) => seen === undefined || seen.rights.get(folderId)?.kinds === 'all';
    },
    ...(audit === undefined ? {} : { audit }),
    // What a delete or rename would leave bound to nothing (T428, AC-275):
    // named where the user may see it, and only counted where not (AC-322).
    referencedBy: async (request, cubes) => {
      const all = (await cat?.referenceDocuments?.()) ?? [];
      const users = usersOfCubes(all, cubes);
      const seen = usersOfCubes(await visibleOf(request, all), cubes);
      // Each with its folder, for a delete's dialog to say where it is (T526).
      const folderOf = new Map(
        all.map((each) => [
          `${each.kind}:${each.id}`,
          folderIdOf((each.body ?? {}) as Record<string, unknown>),
        ]),
      );
      const placed = (kind: string, items: readonly { id: string; title: string | null }[]) =>
        items.map((item) => ({ ...item, folderId: folderOf.get(`${kind}:${item.id}`) ?? null }));
      return {
        charts: placed('chart', seen.charts),
        dashboards: placed('dashboard', seen.dashboards),
        hidden:
          users.charts.length +
          users.dashboards.length -
          seen.charts.length -
          seen.dashboards.length,
      };
    },
    // The views and cubes bound to them at their own publish (T520, AC-365),
    // named where the user sees that folder's models, counted where not.
    ...(xcube === undefined
      ? {}
      : {
          dependentsOf: async (
            request: FastifyRequest,
            cubes: readonly string[],
            except: readonly string[],
          ) => {
            const targets = new Set(cubes);
            const resent = new Set(except);
            const [items, served, seen] = await Promise.all([
              // Unreached, or slow (it holds the publish lock): xcube's own
              // check of the change answers for it (502). As T459 waits.
              xcube.items({ timeoutMs: 15_000 }).catch(() => []),
              folders === undefined ? ROOT_ONLY : folders(),
              visibilityOf(request),
            ]);
            const wechartIdOf = new Map([...served.ids].map(([ours, theirs]) => [theirs, ours]));
            const bound = items
              .filter(
                (item) =>
                  !targets.has(item.fullName) &&
                  !resent.has(item.fullName) &&
                  Object.values(item.bindings).some((name) => targets.has(name)),
              )
              .map((item) => ({
                kind: item.kind ?? 'cube',
                name: item.name,
                folderId: wechartIdOf.get(item.folderId) ?? item.folderId,
              }));
            const shown = bound.filter(
              (item) => seen === undefined || seen.rights.get(item.folderId)?.kinds === 'all',
            );
            const strip = ({ name, folderId }: { name: string; folderId: string }) => ({
              name,
              folderId,
            });
            return {
              views: shown.filter((item) => item.kind === 'view').map(strip),
              cubes: shown.filter((item) => item.kind !== 'view').map(strip),
              hidden: bound.length - shown.length,
            };
          },
        }),
  });
  /**
   * Who may use Jobs and Schedules, over which folders (T371, AC-297; R40):
   * a Super-Admin, and anyone with sign-in off, every folder; a read-write
   * member, the folders they write; no one else.
   */
  const jobsAccess: JobsAccess = {
    scope: async (request) => {
      const seen = await visibilityOf(request);
      if (seen === undefined || userOf(request).superAdmin) return { all: true };
      return {
        all: false,
        writes: (folderId) => mayWrite(seen, folderId),
        sees: (folderId) => seen.rights.has(folderId),
        writesAny: [...seen.rights.values()].some((right) => right.write),
      };
    },
    ...(folders === undefined ? {} : { folders }),
    tree: async () =>
      (cat ? await cat.folders({ counted: false }) : []) as {
        id: string;
        title: string;
        parentId: string | null;
      }[],
  };
  // With the model's files: each rollup's link names its stored file (T449).
  registerBuilds(app, client, modelFiles, jobsAccess);
  // With the model's files: a key's SQL is read there (T273's review).
  // And each folder's, under its prefixed names (T450's review).
  registerSchedules(app, client, modelFiles, folders, jobsAccess);
  // A data source's catalog, through Cube's introspection API (T145, AC-139).
  registerIntrospection(app, client, {
    ...(introspectionRetryMs === undefined ? {} : { retryMs: introspectionRetryMs }),
    /**
     * Only one the user may see (T408, AC-268, AC-263): Cube names a wechart
     * data source by its connection (`connectionNameOf` its folder and
     * name), and Cube's own `default`, from its settings, is the shared
     * root's. A name that is neither is a Super-Admin's alone (T408's
     * review): what it reads, and whose, isn't known here.
     */
    seesSource: async (request) => {
      const seen = await visibilityOf(request);
      if (seen === undefined) return () => true;
      const published = folders === undefined ? ROOT_ONLY : await folders();
      const folderOf = new Map<string, string>([['default', ROOT_FOLDER_ID]]);
      for (const source of (await dataSources?.all()) ?? []) {
        const xcubeId = published.ids.get(source.folderId);
        if (xcubeId !== undefined)
          folderOf.set(connectionNameOf(xcubeId, source.name), source.folderId);
      }
      const superAdmin = userOf(request).superAdmin;
      return (source) => {
        const folder = folderOf.get(source);
        return folder === undefined ? superAdmin : seen.rights.get(folder)?.kinds === 'all';
      };
    },
  });
  // The audit trail, for Super-Admins (T369, AC-295).
  if (audit !== undefined)
    registerAudit(app, {
      store: audit,
      folders: async () =>
        (cat ? await cat.folders({ counted: false }) : []) as {
          id: string;
          title: string;
          parentId: string | null;
        }[],
      ...(config.auditRetentionDays === undefined
        ? {}
        : { retentionDays: config.auditRetentionDays }),
    });
  // Each folder's AD groups and its effective access (T314, AC-259, AC-260).
  if (folderAccess !== undefined)
    registerFolderAccess(
      app,
      folderAccess,
      audit === undefined
        ? undefined
        : {
            store: audit,
            // A folder's name for its record (T368): the root is Shared.
            titleOf: async (folderId) => {
              if (folderId === ROOT_FOLDER_ID) return 'Shared';
              const folder = await docs?.get?.('folder', folderId);
              const title = folder?.body['title'];
              return typeof title === 'string' ? title : undefined;
            },
          },
      // Each folder's name, for a preview's reach by path (T438).
      async () =>
        new Map(
          (
            (cat ? await cat.folders({ counted: false }) : []) as { id: string; title: string }[]
          ).map((folder) => [folder.id, folder.title]),
        ),
      config.superAdminGroup,
    );
  /**
   * Data sources (T335): seen by those who see a folder's every kind — never
   * a read-only user (AC-263) — and changed only by its read-write members
   * (AC-262, AC-266). One a user may not see answers as one that isn't there.
   */
  if (dataSources !== undefined)
    registerDataSources(app, {
      store: dataSources,
      // Each change recorded (T368, AC-294).
      ...(audit === undefined ? {} : { audit }),
      ...(config.seedToken === undefined ? {} : { seedToken: config.seedToken }),
      // Workspaces are signed-in users' (T343): with security off, as the
      // documents' routes, a data source has none (T345's review).
      ...(config.security === 'off'
        ? {}
        : {
            workspaceOf: (folderId: string) => workspaceRootOf(folderId),
            // The user's own, where they have one (AC-277; T346).
            ownWorkspace: async (request: FastifyRequest) => {
              const seen = await visibilityOf(request);
              const own = workspaceIdOf(userOf(request).key);
              return seen?.rights.has(own) === true ? own : undefined;
            },
          }),
      ...(dataSourceLanding === undefined ? {} : { landing: dataSourceLanding }),
      ...(connectionTest === undefined ? {} : { tester: connectionTest }),
      ...(connectionTests === undefined ? {} : { tests: connectionTests }),
      ...(connectionHealth === undefined ? {} : { health: connectionHealth }),
      // The Data sources page (T364, AC-157): the folders a user sees every
      // item of — never a read-only user's (AC-263) — and each one's path.
      listing: {
        // The cubes xcube bound to each, at publish (T459, AC-157): only xcube
        // knows, since nothing is rebound when a nearer source is added.
        ...(xcube === undefined
          ? {}
          : {
              usedBy: async () => {
                const [held, published, all] = await Promise.all([
                  // A page waits for this read, so not a publish's two minutes
                  // (T459's review): the 15 s a connection's calls wait.
                  xcube.items({ timeoutMs: 15_000 }),
                  folders === undefined ? ROOT_ONLY : folders(),
                  dataSources.all(),
                ]);
                // wechart's YAML: what a cube extends, and each cube's file
                // (T499; design 03's Usage names each cube's model).
                const files =
                  modelFiles === undefined
                    ? []
                    : modelFiles.all === undefined
                      ? await modelFiles.list()
                      : await modelFiles.all();
                const extended = new Map<string, string>();
                const fileOf = new Map<string, string>();
                for (const file of files) {
                  const xcubeId = published.ids.get(file.folderId ?? ROOT_FOLDER_ID);
                  if (xcubeId === undefined) continue;
                  const found = extendsIn(file.content);
                  if (found !== undefined) extended.set(`${xcubeId}/${found.name}`, found.extends);
                  for (const declared of declaredIn(file.content))
                    if (declared.kind === 'cube' && declared.name !== '')
                      fileOf.set(`${xcubeId}/${declared.name}`, file.path);
                }
                return cubesUsing({
                  held,
                  published,
                  sources: all,
                  extendsOf: (xcubeId, name) => extended.get(`${xcubeId}/${name}`),
                  fileOf: (xcubeId, name) => fileOf.get(`${xcubeId}/${name}`),
                });
              },
            }),
        sees: async (request) => {
          const seen = await visibilityOf(request);
          if (seen === undefined) return () => true;
          return (folderId) => seen.rights.get(folderId)?.kinds === 'all';
        },
        pathOf: () => folderPathsOf(),
      },
      ...(config.xcubePublicKey === undefined ? {} : { key: config.xcubePublicKey }),
      access: async (request, folderId, want) => {
        const seen = await visibilityOf(request);
        if (seen === undefined) return undefined;
        const right = seen.rights.get(folderId);
        const notThere = {
          status: 404,
          body: { error: 'There’s no such folder, or it isn’t yours to see.' },
        };
        // My workspace, to one who has none, refuses as read-only (T343, AC-277).
        if (
          right === undefined &&
          want === 'write' &&
          folderId === workspaceIdOf(userOf(request).key)
        )
          return { status: 403, body: { error: READ_ONLY } };
        if (right === undefined) return notThere;
        // A folder they see but may not change says so, even to a read-only
        // member, who sees none of its data sources (T335's review).
        if (want === 'write' && !right.write) return { status: 403, body: { error: READ_ONLY } };
        return right.kinds === 'all' ? undefined : notThere;
      },
    });

  // Workspace items proposed to their target folders (T349, AC-284).
  if (proposals !== undefined && docs?.get !== undefined && docs.named !== undefined) {
    const get = docs.get.bind(docs);
    const named = docs.named.bind(docs);
    registerProposals(app, {
      store: proposals,
      ...(audit === undefined ? {} : { audit }),
      // Workspaces are signed-in users' (T343); T359 brings the single user's.
      enabled: security !== 'off',
      // An approval publishes: each item bound in its folder, as a save there
      // was before a shared one could no longer be saved (T502, AC-272).
      bind: (kind, folderId, body) => boundIn(kind, folderId, body),
      // A data source's changed settings, proposed only once tested (T515, AC-158).
      ...(dataSources === undefined || connectionTests === undefined
        ? {}
        : {
            untested: async (source: DataSource) => {
              // As its origin is, where it came from: nothing changed to test.
              // Compared sealed, never opened; a copy's revisions are its own.
              if (source.origin !== null) {
                const [mine, theirs] = await Promise.all([
                  dataSources.withSealed(source.id),
                  dataSources.withSealed(source.origin.id),
                ]);
                if (
                  mine !== undefined &&
                  theirs !== undefined &&
                  mine.source.driver === theirs.source.driver &&
                  mine.source.authMethod === theirs.source.authMethod &&
                  isDeepStrictEqual(mine.source.fields, theirs.source.fields) &&
                  isDeepStrictEqual(mine.landed.sealed, theirs.landed.sealed)
                )
                  return undefined;
              }
              const test = (
                await connectionTests.latestAsStored(
                  [source.id],
                  new Map([[source.id, source.settingsPrint]]),
                )
              ).get(source.id);
              return test?.ok === true && test.settings === source.settingsPrint
                ? undefined
                : 'Test its connection first: a data source’s changed settings are proposed only once a test of them passed.';
            },
          }),
      documents: {
        get: async (kind, id) => {
          const found = await get(kind, id);
          return found === null ? null : { ...found, version: found.version ?? 1 };
        },
        named,
        // What an approval lands through (T352).
        ...(docs.update === undefined || docs.remove === undefined || docs.localTo === undefined
          ? {}
          : {
              update: async (input) => {
                const written = (await docs.update!(input)) as { version?: number };
                return { id: input.id, body: input.body, version: written.version ?? 1 };
              },
              create: async (input) => {
                await docs.create(input);
                return { id: input.id, body: input.body, version: 1 };
              },
              remove: (kind, id) => docs.remove!(kind, id),
              localTo: async (dashboardId) => [...(await docs.localTo!(dashboardId))],
            }),
      },
      ...(versions === undefined ? {} : { versions }),
      ...(dataSources === undefined
        ? {}
        : {
            dataSources,
            // A data source landed as proposed: its envelopes as sealed, into
            // xcube before it is stored (T352; T442, AC-298).
            dataSourceLanding: {
              land: async (item) => {
                const shape = item.snapshot as {
                  name: string;
                  driver: string;
                  authMethod: string;
                  fields: Record<string, FieldValue>;
                  description?: string | null;
                  sealed: Record<string, SealedV1>;
                };
                const landing =
                  dataSourceLanding === undefined
                    ? {}
                    : await dataSourceLanding.prepare(item.landsIn);
                const change = {
                  authMethod: shape.authMethod,
                  fields: shape.fields,
                  sealed: shape.sealed,
                  description: shape.description ?? null,
                };
                if (item.replaces !== null) {
                  const updated = await dataSources.update(item.replaces.id, change, landing);
                  return { id: updated.id, version: updated.version };
                }
                const created = await dataSources.create(
                  {
                    folderId: item.landsIn,
                    name: shape.name,
                    driver: shape.driver,
                    authMethod: shape.authMethod,
                    fields: shape.fields,
                    sealed: shape.sealed,
                  },
                  landing,
                );
                const described =
                  change.description === null
                    ? created
                    : await dataSources.update(created.id, { description: change.description });
                return { id: described.id, version: described.version };
              },
              current: async (id) => {
                const found = await dataSources.withSealed(id);
                if (found === undefined) return undefined;
                const { source, landed } = found;
                return {
                  version: source.version,
                  folderId: source.folderId,
                  body: {
                    name: source.name,
                    driver: source.driver,
                    authMethod: source.authMethod,
                    fields: source.fields,
                    description: source.description,
                    sealed: landed.sealed,
                    revisions: landed.revisions,
                  },
                };
              },
            },
          }),
      ownWorkspace: async (request) => {
        const seen = await visibilityOf(request);
        const own = workspaceIdOf(userOf(request).key);
        return seen?.rights.has(own) === true ? own : null;
      },
      workspaceOf: (folderId) => workspaceRootOf(folderId),
      // Read once a request, then asked per folder (T351's review).
      writable: async (request) => {
        const seen = await visibilityOf(request);
        return (folderId) => seen === undefined || mayWrite(seen, folderId);
      },
      // A target's path from Shared, on the Reviews page (T355).
      folders: async () =>
        (cat ? await cat.folders({ counted: false }) : []) as {
          id: string;
          title: string;
          parentId: string | null;
        }[],
    });
  }

  /**
   * Exporting a dashboard (T511; AC-354, AC-355): what may go with it, of
   * what its user may see, and the file of what was chosen. Anyone who may
   * open the dashboard may export it, a reader too (rule 68).
   */
  registerExport(app, {
    dashboardFor: async (request, reply, id) => {
      const found = await itemFor(request, reply, 'dashboard', id, 'open');
      if (found === undefined) return undefined;
      const stored = found.stored ?? (await docs?.get?.('dashboard', id)) ?? null;
      if (stored === null) {
        await reply.code(404).send(NOT_THERE);
        return undefined;
      }
      return stored;
    },
    chart: async (id) => {
      try {
        return { found: (await docs?.get?.('chart', id)) ?? null };
      } catch (failure) {
        if (failure instanceof ChartDocumentError) return { unreadable: failure.message };
        throw failure;
      }
    },
    sightOf: async (request) => {
      const seen = await visibilityOf(request);
      return seen === undefined ? () => 'all' : (folderId) => seen.rights.get(folderId)?.kinds;
    },
    opensOf: async (request) => {
      const seen = await visibilityOf(request);
      return async (chart) => seen === undefined || (await mayOpen(seen, 'chart', chart));
    },
    viewOnly: async (request) => {
      const seen = await visibilityOf(request);
      return (
        seen !== undefined && ![...seen.rights.values()].some((right) => right.kinds === 'all')
      );
    },
    folders: async () =>
      (cat ? await cat.folders({ counted: false }) : []) as {
        id: string;
        title: string;
        parentId: string | null;
      }[],
    modelFiles: async () =>
      modelFiles === undefined
        ? []
        : modelFiles.all === undefined
          ? modelFiles.list()
          : modelFiles.all(),
    ...(folders === undefined ? {} : { published: folders }),
    ...(dataSources === undefined ? {} : { dataSources: () => dataSources.all() }),
  });

  /**
   * Importing an export file (T513; AC-356, AC-357, AC-359): into the
   * importer's own workspace as new drafts, with a target they may write, as
   * `POST /api/documents` makes one there (T345). With sign-in off, `mine`.
   */
  const pathsOf = async (request: FastifyRequest) => {
    const seen = await visibilityOf(request);
    const all = (cat ? await cat.folders({ counted: false }) : []) as {
      id: string;
      title: string;
      parentId: string | null;
    }[];
    const byId = new Map(all.map((folder) => [folder.id, folder]));
    return (folderId: string): string[] | null => {
      if (seen !== undefined && !seen.rights.has(folderId)) return null;
      if (folderId !== ROOT_FOLDER_ID && !byId.has(folderId)) return null;
      // Its path from Shared: the root's is none.
      const path: string[] = [];
      for (
        let at = byId.get(folderId);
        at !== undefined && path.length <= all.length;
        at = at.parentId === null ? undefined : byId.get(at.parentId)
      )
        path.unshift(at.title);
      return path;
    };
  };
  if (docs?.createTogether !== undefined && docs.named !== undefined && docs.get !== undefined) {
    const createTogether = docs.createTogether.bind(docs);
    const named = docs.named.bind(docs);
    const get = docs.get.bind(docs);
    registerImport(app, {
      workspaceOf: async (request) => {
        if (security === 'off') return MY_WORKSPACE_ID;
        const seen = await visibilityOf(request);
        if (seen === undefined) return workspaceIdOf(userOf(request).key);
        const own = workspaceIdOf(userOf(request).key);
        return seen.rights.has(own) ? own : undefined;
      },
      targetOf: async (request, reply, own, target) => {
        const need = {
          error: 'Name the shared folder it is to go to: one where you have read-write access.',
        };
        if (typeof target !== 'string' || target === '') {
          await reply.code(400).send(need);
          return undefined;
        }
        const inside = await workspaceRootOf(target);
        // Another's workspace is as a folder that isn't there (T345's review).
        if (inside !== null) {
          await (inside === own ? reply.code(400).send(need) : reply.code(404).send(NOT_THERE));
          return undefined;
        }
        const seen = await visibilityOf(request);
        const path = (await pathsOf(request))(target);
        if (seen !== undefined && !mayWrite(seen, target)) {
          await (seen.rights.has(target)
            ? reply.code(403).send({ error: READ_ONLY })
            : reply.code(404).send(NOT_THERE));
          return undefined;
        }
        if (path === null) {
          await reply.code(404).send(NOT_THERE);
          return undefined;
        }
        return { id: target, path };
      },
      holdings: async (request, own, target, titles) => {
        const pathOf = await pathsOf(request);
        const found = new Map<string, number>();
        for (const { kind, title } of titles) {
          const same = await named(kind, target, title);
          if (same !== null) found.set(`${kind}:${title}`, same.version);
        }
        const mine = [own, ...(await foldersBeneath(own)).map((folder) => folder.id)];
        const drafts = cat
          ? (
              await Promise.all(
                mine.map(
                  async (folderId) =>
                    (await cat.contents(folderId, { counted: false })) as {
                      kind: string;
                      title: string;
                      targetFolderId?: string | null;
                    }[],
                ),
              )
            ).flat()
          : [];
        const models = modelFiles === undefined ? [] : await modelFiles.list(target);
        const held = dataSources === undefined ? [] : await dataSources.inFolder(target);
        return {
          target: {
            named: (kind, title) => {
              const version = found.get(`${kind}:${title}`);
              return version === undefined ? undefined : { version };
            },
            models: models.map((file) => ({
              path: file.path,
              declares: objectsOf(file.path, file.content).objects.map((each) => each.name),
            })),
            sourceNames: held.map((source) => source.name),
          },
          workspace: drafts
            .filter((draft) => draft.kind !== 'folder')
            .map((draft) => ({
              kind: draft.kind,
              title: draft.title,
              targetPath:
                typeof draft.targetFolderId === 'string' ? pathOf(draft.targetFolderId) : null,
            })),
        };
      },
      declares: (path, content) => objectsOf(path, content).objects.map((each) => each.name),
      keepsChart: async (request, chartId, own) => {
        let chart;
        try {
          chart = await get('chart', chartId);
        } catch (failure) {
          if (failure instanceof ChartDocumentError) return false;
          throw failure;
        }
        if (chart === null) return false;
        const seen = await visibilityOf(request);
        if (seen !== undefined && !(await mayOpen(seen, 'chart', chart))) return false;
        return staysInItsWorkspace(chart, own);
      },
      // An image they may see, where it is shown (T408's review).
      keepsImage: async (request, imageId) => {
        const seen = await visibilityOf(request);
        return seen === undefined || readsImage(seen, imageId);
      },
      owner: (request) => userOf(request).key,
      create: (creates) => createTogether(creates),
      mappable: async (request, id, own, target) => {
        const source = await dataSources?.get(id);
        if (source === undefined) return undefined;
        const seen = await visibilityOf(request);
        if (seen !== undefined && seen.rights.get(source.folderId)?.kinds !== 'all')
          return undefined;
        const home = await workspaceRootOf(source.folderId);
        const about = { id: source.id, name: source.name, driver: source.driver };
        // One made in their workspace for this import: going to its target.
        if (home !== null)
          return home === own && source.targetFolderId === target
            ? { ...about, path: ['My workspace'], created: true }
            : undefined;
        // Else one a model in the target binds to: its own, or above it (AC-273).
        const parents = new Map(
          (
            (cat ? await cat.folders({ counted: false }) : []) as {
              id: string;
              parentId: string | null;
            }[]
          ).map((folder) => [folder.id, folder.parentId]),
        );
        const above: string[] = [];
        for (
          let at: string | null | undefined = target;
          at != null && !above.includes(at);
          at = at === ROOT_FOLDER_ID ? null : (parents.get(at) ?? ROOT_FOLDER_ID)
        )
          above.push(at);
        if (!above.includes(source.folderId)) return undefined;
        return { ...about, path: (await pathsOf(request))(source.folderId) ?? [], created: false };
      },
    });
  }

  /**
   * The charts and dashboards that use the members an edit changes, listed
   * before it is saved (T147, AC-141): `{ members: ['orders.count', …] }`, in
   * the body, since a wide cube's names would outgrow a URL.
   */
  app.post('/api/model/references', USER, async (request) => {
    const asked = (request.body as { members?: unknown } | undefined)?.members;
    const members = (Array.isArray(asked) ? (asked as unknown[]) : [])
      .filter((member): member is string => typeof member === 'string')
      .map((member) => member.trim())
      .filter((member) => member !== '');
    if (members.length === 0) return { charts: [], dashboards: [] };
    const all = (await cat?.referenceDocuments?.()) ?? [];
    return referencesOf(await visibleOf(request, all), members);
  });

  /**
   * AC-011: a superseded query is stopped in Cube, not merely ignored in the
   * browser. Always answers 204: the tile that issued it is already gone, and
   * a failure to cancel is not something anyone can act on.
   */
  app.delete('/api/running-query/:requestId', USER, async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      await cubeFor(request).cancel(requestId);
    } catch (error) {
      app.log.warn({ err: error, requestId }, 'could not cancel query');
    }
    return reply.status(204).send();
  });

  /**
   * AC-016: every query is recorded — the request, the duration and whether it
   * was accelerated — including the ones that fail, since a query that ran for
   * four seconds and then errored is exactly what someone opens the Jobs
   * workspace to find.
   */
  app.post('/api/load', USER, async (request, reply) => {
    const body = request.body as
      | { query?: Record<string, unknown>; cache?: unknown; context?: unknown; for?: unknown }
      | undefined;
    if (!body?.query) throw new BadRequest();
    // Cube's own cache policy, and only its own values: `no-cache` for a
    // tile's "Refresh now" (T154, AC-148).
    const cache = body.cache;
    if (cache !== undefined && !CACHE_POLICIES.includes(cache as CachePolicy))
      throw new BadRequest();
    // A previewed security context (T172, AC-166): its claims, never wechart's.
    const context = previewOf(request, body.context);
    // The item it serves, checked before Cube is asked (T340, AC-268).
    const scope = await queryScope(request, reply, queryItemOf(body.for));
    if (scope === undefined || (await refusedOutside(reply, scope, body.query))) return reply;

    const requestId = String(request.headers['x-request-id'] ?? 'unknown');
    const startedAt = performance.now();

    try {
      const result = await cubeFor(request).load(
        body.query,
        cache as CachePolicy | undefined,
        context,
      );
      const { accelerated, preAggregation } = accelerationOf(result);
      await record({
        requestId,
        query: body.query,
        durationMs: performance.now() - startedAt,
        accelerated,
        preAggregation,
        userKey: ranBy(request),
      });
      return result;
    } catch (error) {
      await record({
        requestId,
        query: body.query,
        durationMs: performance.now() - startedAt,
        accelerated: false,
        error: error instanceof Error ? error.message : String(error),
        userKey: ranBy(request),
      });
      throw error;
    }
  });

  /**
   * Whether a chart's query is served from a rollup, and when it is not, the
   * member that stops the nearest one (T150, AC-144). The match is Cube's own
   * word — `/v1/sql` names the pre-aggregations it will use — so the panel
   * never reports one Cube does not use; the reason is worked out from its
   * dry run against the rollups it compiled (`preaggMatch.ts`).
   */
  app.post('/api/acceleration', USER, async (request, reply) => {
    const body = request.body as { query?: Record<string, unknown>; for?: unknown } | undefined;
    if (!body?.query) throw new BadRequest();
    const query = body.query;
    // The item it serves, checked before Cube is asked (T340, AC-268).
    const scope = await queryScope(request, reply, queryItemOf(body.for));
    if (scope === undefined || (await refusedOutside(reply, scope, query))) return reply;
    // One plan, or — for a query Cube runs as several — one per query; a
    // match only if a rollup serves every one, Cube's matching being
    // all-or-nothing (research/cube/pre-aggregations.md §2).
    const cube = cubeFor(request);
    const planned = await cube.sql(query);
    const usedBy = (Array.isArray(planned) ? planned : [planned]).map((plan) =>
      (
        (plan as { sql?: { preAggregations?: { preAggregationId?: unknown }[] } } | null)?.sql
          ?.preAggregations ?? []
      )
        .map((each) => each.preAggregationId)
        .find((id): id is string => typeof id === 'string'),
    );
    const used = usedBy[0];
    if (used !== undefined && usedBy.every((id) => id !== undefined)) return { matched: used };

    // Why not is extra: the miss is Cube's plan, and holds without a reason —
    // a chart rollup-only mode would refuse still says so (T153's review).
    try {
      const [dryRun, compiled] = await Promise.all([cube.dryRun(query), cube.metaExtended()]);
      const transformed =
        (dryRun as { transformedQueries?: Transformed[] } | null)?.transformedQueries?.[0] ?? {};
      // Said in the model's titles, as a person reads it (T403, AC-220); the
      // member's name stays beside its title for what matches on it.
      const name = titlesFrom(compiled);
      const miss = missOf(transformed, query, rollupsFrom(compiled), name);
      return { matched: null, miss: { ...miss, title: name(miss.member) } };
    } catch (failure) {
      request.log.warn({ failure }, 'why a query is not served from a rollup could not be read');
      return { matched: null };
    }
  });

  /**
   * A query's SQL as Cube generates it for a previewed security context
   * (T174, AC-168): `/v1/sql` asked as the context, generated after its
   * policies apply, so the row filters they add are in it with the values it
   * binds (research/cube/access-control.md, "Observed locally"). Every
   * statement, for a query Cube runs as several: one left out would be SQL
   * the context runs that is not shown.
   */
  app.post('/api/sql', USER, async (request, reply) => {
    const body = request.body as
      { query?: Record<string, unknown>; context?: unknown; for?: unknown } | undefined;
    if (!body?.query) throw new BadRequest();
    const context = previewOf(request, body.context);
    // The item it serves, checked before Cube is asked (T340, AC-268).
    const scope = await queryScope(request, reply, queryItemOf(body.for));
    if (scope === undefined || (await refusedOutside(reply, scope, body.query))) return reply;
    const planned = await cubeFor(request).sql(body.query, context);
    const queries = (Array.isArray(planned) ? planned : [planned]).map((plan) => {
      const [sql, params] = (plan as { sql?: { sql?: [unknown, unknown] } } | null)?.sql?.sql ?? [];
      return { sql, params: Array.isArray(params) ? params : [] };
    });
    // An answer without SQL is said as one, not shown as an empty statement.
    if (queries.length === 0 || queries.some(({ sql }) => typeof sql !== 'string'))
      return reply.status(502).send({ error: 'Cube answered without the SQL it would run.' });
    return { queries };
  });

  // Explore's folder tree and contents (AC-017).
  /**
   * With security on, what the request's user may see of the shared tree
   * (T325, AC-264): each folder a grant reaches, down or up (`folderRights`).
   * With it off, undefined: the single user sees everything, as in phase 1.
   */
  const visibilityOf = async (request: FastifyRequest): Promise<Visibility | undefined> => {
    if (security === 'off') return undefined;
    const user = userOf(request);
    if (folderAccess === undefined) {
      // No store of groups: a Super-Admin sees everything, and no one else anything.
      return user.superAdmin ? undefined : { tree: [], rights: new Map() };
    }
    const tree = await folderAccess.tree();
    const rights = new Map(
      folderRights(tree, { groups: user.groups, superAdmin: user.superAdmin }),
    );
    // A private workspace for a Super-Admin or read-write member, and theirs
    // alone (T343, AC-276): its root and every folder beneath it. A user with
    // read-only access everywhere has none (AC-277).
    if (!user.superAdmin && ![...rights.values()].some((right) => right.write))
      return { tree, rights };
    const own = workspaceIdOf(user.key);
    const inside = await foldersBeneath(own);
    for (const id of [own, ...inside.map((folder) => folder.id)]) rights.set(id, OWN_WORKSPACE);
    return { tree: [...tree, { id: own, parentId: null }, ...inside], rights };
  };
  /** The folders in a workspace, at any depth, by their parents. */
  const foldersBeneath = async (rootId: string): Promise<AccessFolder[]> => {
    if (!cat) return [];
    const all = (await cat.folders({ counted: false })) as {
      id: string;
      parentId: string | null;
    }[];
    const children = new Map<string, { id: string; parentId: string }[]>();
    for (const folder of all) {
      if (folder.parentId === null) continue;
      const siblings = children.get(folder.parentId);
      const child = { id: folder.id, parentId: folder.parentId };
      if (siblings === undefined) children.set(folder.parentId, [child]);
      else siblings.push(child);
    }
    const found: AccessFolder[] = [];
    const seen = new Set<string>();
    const pending = [rootId];
    while (pending.length > 0) {
      const at = pending.pop()!;
      for (const child of children.get(at) ?? [])
        if (!seen.has(child.id)) {
          seen.add(child.id);
          found.push(child);
          pending.push(child.id);
        }
    }
    return found;
  };
  /** Each visible folder's count of what the user may see in and beneath it (AC-194). */
  type Stored = { readonly id: string; readonly body: Record<string, unknown> };
  const folderIdOf = (body: Record<string, unknown>): string | null =>
    typeof body['folderId'] === 'string' ? body['folderId'] : null;
  /**
   * A body with the shared folder it is to go to as stored: checked when a
   * workspace item was made (T345, AC-282), and never changed by a save,
   * which could otherwise drop it or point it at a folder its author may not
   * write (T345's review).
   */
  const withStoredTarget = (
    body: Record<string, unknown>,
    stored: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> => {
    // Its origin too (T344's review): what a copy was copied from is the
    // server's record, which its proposal and overlay rely on (T347, T349).
    const { targetFolderId: _sent, origin: _origin, ...rest } = body;
    void [_sent, _origin];
    const target = stored?.['targetFolderId'];
    const origin = stored?.['origin'];
    return {
      ...rest,
      ...(target === undefined ? {} : { targetFolderId: target }),
      ...(origin === undefined ? {} : { origin }),
    };
  };
  /**
   * The folder whose rights govern an item (T326): a folder's own; a chart
   * local to a dashboard, its dashboard's (AC-126); any other item, the
   * folder it sits in.
   */
  const governingFolder = async (kind: string, item: Stored): Promise<string | null> => {
    if (kind === 'folder') return item.id;
    const local = item.body['localToDashboardId'];
    if (kind === 'chart' && typeof local === 'string') {
      const dashboard = await docs?.get?.('dashboard', local);
      return dashboard ? folderIdOf(dashboard.body) : null;
    }
    return folderIdOf(item.body);
  };
  /**
   * Whether the user may open a stored item (T326, AC-263, AC-264): a folder
   * they may see; a dashboard, or a chart local to one, in a folder they may
   * see; a library chart in a folder whose every kind is theirs, or on a
   * dashboard they may open — a read-only user sees the charts on their
   * dashboards, wherever those charts are kept.
   */
  const mayOpen = async (seen: Visibility, kind: string, item: Stored): Promise<boolean> => {
    const folder = await governingFolder(kind, item);
    const right = folder === null ? undefined : seen.rights.get(folder);
    const library = kind === 'chart' && typeof item.body['localToDashboardId'] !== 'string';
    if (!library) return right !== undefined;
    if (right?.kinds === 'all') return true;
    // A chart in a workspace is its owner's alone, whatever shows it (T343's review, AC-276).
    if (folder !== null && (await workspaceRootOf(folder)) !== null) return false;
    const using = (cat?.dashboardsUsing ? await cat.dashboardsUsing(item.id) : []) as {
      folderId: string | null;
    }[];
    return using.some(
      (dashboard) => dashboard.folderId !== null && seen.rights.has(dashboard.folderId),
    );
  };
  /**
   * A chart's or a dashboard's cubes bound in the folder it is published
   * into (T429, AC-272; `model/bind.ts`): its body with each name stored as
   * bound, or the names no folder on its path holds. Stored as it is where
   * xcube isn't configured or holds no items yet, and in a folder xcube
   * doesn't serve (a workspace's, until slice 5).
   */
  type Bound =
    | { readonly kind: 'ok'; readonly body: Record<string, unknown> }
    | { readonly kind: 'refused'; readonly names: readonly string[] }
    | { readonly kind: 'unreachable' };
  const boundIn = async (
    kind: 'chart' | 'dashboard',
    folderId: string | null,
    body: Record<string, unknown>,
  ): Promise<Bound> => {
    if (xcube === undefined || folders === undefined || folderId === null)
      return { kind: 'ok', body };
    const chart = body['chart'] as ChartDefinition | undefined;
    // A dashboard's own: its filters', and its text tiles' tokens' (T389's review).
    const filterCubes = kind === 'dashboard' ? cubesOfDashboard(body) : [];
    // A chart with no fields yet names no cube: nothing to bind.
    if (kind === 'chart' && (typeof chart?.source?.cube !== 'string' || chart.source.cube === ''))
      return { kind: 'ok', body };
    if (kind === 'dashboard' && filterCubes.length === 0) return { kind: 'ok', body };
    try {
      const xcubeId = (await folders()).ids.get(folderId);
      if (xcubeId === undefined || (await xcube.revision()).mode !== 'items')
        return { kind: 'ok', body };
      const bind = () =>
        kind === 'chart'
          ? bindChart(xcube, xcubeId, chart!)
          : bindNames(xcube, xcubeId, filterCubes);
      // A folder made a moment ago may not be in xcube's tree yet, its push
      // made after the answer: put it, and ask again (T429's review).
      const binding = await bind().catch(async (error: unknown) => {
        if (
          !(error instanceof XcubeError && error.code === 'invalid_folders') ||
          !beforeFolderPublish
        )
          throw error;
        await beforeFolderPublish();
        return bind();
      });
      if (binding.kind === 'refused') return binding;
      return {
        kind: 'ok',
        body:
          kind === 'chart'
            ? { ...body, chart: chartRenamed(chart!, binding.renames) }
            : dashboardRenamed(body, binding.renames),
      };
    } catch (error) {
      app.log.warn({ err: error }, 'could not ask xcube to bind an item’s cubes');
      return { kind: 'unreachable' };
    }
  };
  /**
   * Of these charts and dashboards, those the user may see (T326's review):
   * a dashboard in a folder they see, a chart local to one, a library chart
   * where every kind is theirs. All of them with security off.
   */
  const visibleOf = async (
    request: FastifyRequest,
    all: readonly ReferenceDocument[],
  ): Promise<readonly ReferenceDocument[]> => {
    const seen = await visibilityOf(request);
    if (seen === undefined) return all;
    const folderOf = (document: { body: unknown }) =>
      folderIdOf((document.body ?? {}) as Record<string, unknown>);
    const dashboards = new Map(
      all.filter((each) => each.kind === 'dashboard').map((each) => [each.id, each]),
    );
    return all.filter((document) => {
      if (document.kind === 'dashboard') return seen.rights.has(folderOf(document) ?? '');
      if (document.localToDashboardId !== null) {
        const dashboard = dashboards.get(document.localToDashboardId);
        return dashboard !== undefined && seen.rights.has(folderOf(dashboard) ?? '');
      }
      return seen.rights.get(folderOf(document) ?? '')?.kinds === 'all';
    });
  };

  /**
   * Each folder's path from the shared root, as `{ id, title }` steps: the
   * root's is none (T364; T517). Read once, then asked per folder.
   */
  const folderPathsOf = async () => {
    const all = (cat ? await cat.folders({ counted: false }) : []) as {
      id: string;
      title: string;
      parentId: string | null;
    }[];
    const byId = new Map(all.map((folder) => [folder.id, folder]));
    return (folderId: string) => {
      const path: { id: string; title: string }[] = [];
      for (
        let at = byId.get(folderId);
        at !== undefined && path.length <= all.length;
        at = at.parentId === null ? undefined : byId.get(at.parentId)
      )
        path.unshift({ id: at.id, title: at.title });
      return path;
    };
  };

  /** The folder and every folder beneath it, by id (T428). */
  const subtreeOf = async (folderId: string): Promise<Set<string>> => {
    const all = (cat ? await cat.folders({ counted: false }) : []) as {
      id: string;
      parentId: string | null;
    }[];
    const beneath = new Set([folderId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const folder of all)
        if (folder.parentId !== null && beneath.has(folder.parentId) && !beneath.has(folder.id)) {
          beneath.add(folder.id);
          grew = true;
        }
    }
    return beneath;
  };
  /** Whether a folder is My workspace or beneath it (T428). */
  /** The workspace a folder is in, at any depth, or null for a shared one (T343). */
  const workspaceRootOf = async (folderId: string | null): Promise<string | null> => {
    if (folderId === null) return null;
    const parents = new Map(
      (
        (cat ? await cat.folders({ counted: false }) : []) as {
          id: string;
          parentId: string | null;
        }[]
      ).map((folder) => [folder.id, folder.parentId]),
    );
    const seen = new Set<string>();
    for (
      let at: string | null | undefined = folderId;
      at != null && !seen.has(at);
      at = parents.get(at)
    ) {
      if (isWorkspaceId(at)) return at;
      seen.add(at);
    }
    return null;
  };
  const inWorkspace = async (folderId: string): Promise<boolean> =>
    (await workspaceRootOf(folderId)) !== null;
  /**
   * Why a folder can't go into a workspace: the models or data sources in it
   * or beneath it, which xcube's tree, holding no workspace, would lose
   * (T428's review, AC-275; T343's review). Nothing where it may.
   */
  const intoWorkspaceRefusal = async (
    folderId: string,
    target: string,
  ): Promise<{ error: string } | undefined> => {
    if (!(await inWorkspace(target))) return undefined;
    const models = await modelsBeneath(folderId);
    if (models > 0)
      return {
        error: `This folder holds ${String(models)} model${models === 1 ? '' : 's'}, in it or beneath it, and My workspace can’t hold models yet.`,
      };
    const sources = await dataSourcesBeneath(folderId);
    if (sources > 0)
      return {
        error: `This folder holds ${String(sources)} data source${sources === 1 ? '' : 's'}, in it or beneath it, and My workspace can’t hold data sources yet.`,
      };
    return undefined;
  };
  /**
   * Whether a move crosses between a workspace and the shared tree, or two
   * workspaces (T343's review): work reaches a shared folder only through a
   * proposal (F30), and shared work is changed in a copy (AC-278), so with
   * security on neither moves across. Security off keeps phase 1's moves.
   */
  const crossesWorkspace = async (from: string | null, to: string | null) =>
    security !== 'off' && (await workspaceRootOf(from)) !== (await workspaceRootOf(to));
  const ACROSS_WORKSPACE = {
    error:
      'This moves between your workspace and the shared folders: shared work is changed in a copy in your workspace, and reaches a shared folder through a proposal.',
  };
  /** Whether the folder governing an item is a shared one, in no workspace (T502). */
  const isShared = async (kind: string, item: Stored) =>
    (await workspaceRootOf(await governingFolder(kind, item))) === null;
  /**
   * The folder an item is read in (T527): a workspace item's target, where
   * its proposal lands it (AC-282); any other, its own. None for a workspace
   * item with no target.
   */
  const landsIn = async (body: Record<string, unknown>): Promise<string | null> => {
    const folder = folderIdOf(body);
    if ((await workspaceRootOf(folder)) === null) return folder;
    return typeof body['targetFolderId'] === 'string' ? body['targetFolderId'] : null;
  };
  /** A shared folder's path: it, the folders above it, and the root (T527). */
  const pathTo = async (folderId: string): Promise<ReadonlySet<string>> => {
    const parents = new Map(
      (
        (cat ? await cat.folders({ counted: false }) : []) as {
          id: string;
          parentId: string | null;
        }[]
      ).map((folder) => [folder.id, folder.parentId]),
    );
    const path = new Set<string>([ROOT_FOLDER_ID]);
    for (
      let at: string | null | undefined = folderId;
      at != null && !path.has(at);
      at = parents.get(at)
    )
      path.add(at);
    return path;
  };
  interface CopiedOnUse {
    /** The library chart copied. */
    readonly from: string;
    readonly id: string;
    readonly title: unknown;
    readonly body: Record<string, unknown>;
  }
  /**
   * Copy on use (T527, AC-371; the user's answer on AC-263): with sign-in on,
   * a dashboard shows only library charts kept on the path of the folder it
   * is read in — that folder or one above it — which every reader of it may
   * open, and xcube admits them to. Any other library chart it shows becomes
   * a chart of its own: a copy, in no folder, which it shows instead. Asked
   * of a workspace's dashboard, judged by its target: a shared one's content
   * changes only by an approval (T502), which lands a workspace one's.
   *
   * `sent` has the bodies of charts saved with it, copied as they are sent.
   * Answers each chart's copy by the id it replaces; none with sign-in off.
   */
  const copiesOnUse = async (
    dashboard: { readonly id: string; readonly body: Record<string, unknown> },
    shown: Iterable<string>,
    sent: ReadonlyMap<string, Record<string, unknown>> = new Map(),
  ): Promise<Map<string, CopiedOnUse>> => {
    const copies = new Map<string, CopiedOnUse>();
    if (security === 'off' || docs?.get === undefined) return copies;
    if ((await workspaceRootOf(folderIdOf(dashboard.body))) === null) return copies;
    const home = await landsIn(dashboard.body);
    if (home === null) return copies;
    const path = await pathTo(home);
    for (const chartId of shown) {
      const found = await docs.get('chart', chartId).catch(() => null);
      if (found === null || typeof found.body['localToDashboardId'] === 'string') continue;
      const kept = await landsIn(found.body);
      if (kept === null || path.has(kept)) continue;
      const {
        folderId: _folder,
        targetFolderId: _target,
        origin: _origin,
        owner: _owner,
        ...content
      } = sent.get(chartId) ?? found.body;
      void [_folder, _target, _origin, _owner];
      const owner = dashboard.body['owner'];
      copies.set(chartId, {
        from: chartId,
        id: randomUUID(),
        title: content['title'],
        body: {
          ...content,
          localToDashboardId: dashboard.id,
          ...(typeof owner === 'string' ? { owner } : {}),
        },
      });
    }
    return copies;
  };
  /** What a reply says was copied (T527): each copy, and the chart it copies. */
  const copiedOf = (copies: ReadonlyMap<string, CopiedOnUse>) =>
    [...copies.values()].map(({ from, id, title }) => ({ from, id, title }));
  const renamesOf = (copies: ReadonlyMap<string, CopiedOnUse>) =>
    new Map([...copies].map(([from, copy]) => [from, copy.id]));
  /**
   * The refusal, where the folder already has another dashboard of this
   * title (T336, AC-270): one of a name in a folder, and free across folders
   * (AC-271). Only a user's own naming or moving is asked; an approval
   * replaces the one of its name, as proposals do (P2.6 E).
   */
  const dashboardNamed = async (
    folderId: string | null,
    title: unknown,
    except?: string,
    /** Where it is and what it's called now: asked only when either changes (T336's review). */
    before?: { readonly folderId: string | null; readonly title: unknown },
  ) => {
    if (folderId === null || typeof title !== 'string' || docs?.named === undefined)
      return undefined;
    if (
      before !== undefined &&
      before.folderId === folderId &&
      typeof before.title === 'string' &&
      before.title.trim() === title.trim()
    )
      return undefined;
    /**
     * Not in My workspace: drafts there may share a name, as those brought in
     * from a file and copies do (AC-357), and are held to it when proposed
     * (T513's decision; T336's review).
     */
    if (folderId === MY_WORKSPACE_ID || (await workspaceRootOf(folderId)) !== null)
      return undefined;
    const found = await docs.named('dashboard', folderId, title.trim());
    return found === null || found.id === except
      ? undefined
      : {
          error: `This folder already has a dashboard named “${title.trim()}”.`,
          existing: { kind: 'dashboard', id: found.id, title: title.trim() },
        };
  };
  /** What a dashboard or chart holds, apart from where it is and what it is called (T502). */
  const contentOf = (body: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== 'title' && key !== 'folderId'),
    );
  /** How many model files a folder holds, in it or beneath it (T428). */
  const modelsBeneath = async (folderId: string): Promise<number> => {
    if (modelFiles?.all === undefined) return 0;
    const subtree = await subtreeOf(folderId);
    return (await modelFiles.all()).filter((file) => subtree.has(file.folderId ?? ROOT_FOLDER_ID))
      .length;
  };
  /** How many data sources a folder holds, in it or beneath it (T335's review). */
  const dataSourcesBeneath = async (folderId: string): Promise<number> => {
    if (dataSources === undefined) return 0;
    const subtree = await subtreeOf(folderId);
    return (await dataSources.all()).filter((source) => subtree.has(source.folderId)).length;
  };

  /**
   * What a folder itself holds, by kind (T521, AC-366): its subfolders and
   * its own items. Its models and data sources as their stores hold them,
   * where the server has them.
   */
  const holdingsOf = async (folderId: string) => {
    const own = cat?.ownCounts ? (await cat.ownCounts()).get(folderId) : undefined;
    const subfolders = cat
      ? ((await cat.folders({ counted: false })) as { parentId: string | null }[]).filter(
          (folder) => folder.parentId === folderId,
        ).length
      : 0;
    return {
      subfolders,
      dashboards: own?.dashboards ?? 0,
      charts: own?.charts ?? 0,
      models:
        modelFiles === undefined ? (own?.models ?? 0) : (await modelFiles.list(folderId)).length,
      dataSources:
        dataSources === undefined
          ? (own?.dataSources ?? 0)
          : (await dataSources.inFolder(folderId)).length,
    };
  };
  /** "1 subfolder, 2 dashboards and 1 chart", in AC-366's order, only the kinds it has. */
  const holdingsText = (holds: Awaited<ReturnType<typeof holdingsOf>>): string => {
    const parts = (
      [
        [holds.subfolders, 'subfolder', 'subfolders'],
        [holds.dashboards, 'dashboard', 'dashboards'],
        [holds.charts, 'chart', 'charts'],
        [holds.models, 'model', 'models'],
        [holds.dataSources, 'data source', 'data sources'],
      ] as const
    )
      .filter(([count]) => count > 0)
      .map(([count, one, many]) => `${String(count)} ${count === 1 ? one : many}`);
    return parts.length < 2
      ? parts.join('')
      : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
  };

  /** A refused or unasked binding, answered. */
  const bindingRefused = (reply: FastifyReply, kind: string, bound: Bound) =>
    bound.kind === 'refused'
      ? reply.code(422).send({
          error: `No folder on this ${kind}’s path holds ${bound.names
            .map((name) => `“${name}”`)
            .join(', ')}.`,
          names: bound.names,
        })
      : reply.code(502).send({
          error: `xcube could not be asked where this ${kind}’s cubes are, so it was not saved.`,
        });

  /** Whether the user may change what is in this folder (T326, T327; AC-266, AC-262). */
  const mayWrite = (seen: Visibility, folderId: string | null): boolean =>
    folderId !== null && seen.rights.get(folderId)?.write === true;
  /**
   * Whether a folder may move from the folder that holds it into another: both
   * theirs to write in, since a folder is an item of the one holding it
   * (AC-291, T329's review), and not the folder itself or anything beneath it,
   * which would cut the subtree off from the root (T326's review).
   */
  const mayMoveFolder = (
    seen: Visibility,
    folderId: string,
    from: string | null,
    into: string | null,
  ): boolean => {
    if (!mayWrite(seen, from) || !mayWrite(seen, into)) return false;
    const beneath = new Set([folderId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const folder of seen.tree) {
        if (folder.parentId !== null && beneath.has(folder.parentId) && !beneath.has(folder.id)) {
          beneath.add(folder.id);
          grew = true;
        }
      }
    }
    return into !== null && !beneath.has(into);
  };
  /** Whether a dashboard's body, or a proposal's snapshot, shows an image: a tile's `imageId`. */
  const showsImage = (body: unknown, imageId: string): boolean => {
    if (Array.isArray(body)) return body.some((each) => showsImage(each, imageId));
    if (body === null || typeof body !== 'object') return false;
    return Object.entries(body).some(([key, each]) =>
      key === 'imageId' ? each === imageId : showsImage(each, imageId),
    );
  };
  /** Every image a dashboard's body, or a proposal's snapshot, shows. */
  const imageIdsOf = (body: unknown, found = new Set<string>()): Set<string> => {
    if (Array.isArray(body)) for (const each of body) imageIdsOf(each, found);
    else if (body !== null && typeof body === 'object')
      for (const [key, each] of Object.entries(body))
        if (key === 'imageId' && typeof each === 'string') found.add(each);
        else imageIdsOf(each, found);
    return found;
  };
  /** A stored dashboard this user may open, or none. */
  const openableDashboard = async (seen: Visibility, dashboardId: string) => {
    const stored = await docs?.get?.('dashboard', dashboardId).catch(() => null);
    return stored != null && (await mayOpen(seen, 'dashboard', stored)) ? stored : undefined;
  };
  /**
   * Whether this user may see an image wherever it is shown (T408, AC-268;
   * T327's review): the dashboard it was added to is one they may open, or a
   * stored dashboard they may open shows it — one an approval landed it on,
   * or a copy of that. A stored dashboard shows only images its writer
   * could see (`addsOnlyReadableImages`), so none is shown them by a body
   * they wrote.
   */
  const readsImage = async (seen: Visibility, imageId: string): Promise<boolean> => {
    const addedTo = (await images?.get(imageId))?.dashboardId;
    if (addedTo === undefined) return false;
    if ((await openableDashboard(seen, addedTo)) !== undefined) return true;
    const showing = (await cat?.dashboardsShowingImage?.(imageId)) ?? [];
    return showing.some(
      (dashboard) => dashboard.folderId !== null && seen.rights.has(dashboard.folderId),
    );
  };
  /**
   * A save that puts on a dashboard only images its user may see, or that it
   * already showed (T408's review): so a body they write is no way to
   * another folder's image.
   */
  const addsOnlyReadableImages = async (
    seen: Visibility,
    before: unknown,
    after: unknown,
  ): Promise<boolean> => {
    const had = imageIdsOf(before);
    for (const imageId of imageIdsOf(after))
      if (!had.has(imageId) && !(await readsImage(seen, imageId))) return false;
    return true;
  };
  const IMAGES_REFUSED = { error: 'This dashboard can show only images you may open.' };
  /**
   * Whether an image goes to this user (T408, AC-268): one they may see
   * wherever it is shown (`readsImage`); or, named by the tile asking for it
   * (`?for=`, as a query names its item), one a kept version of that
   * dashboard shows, to those who may read its history (T354), or one a
   * proposal in review shows, to those who may open it. With sign-in off,
   * anyone.
   */
  const mayShowImage = async (request: FastifyRequest, imageId: string): Promise<boolean> => {
    const seen = await visibilityOf(request);
    if (security === 'off' || seen === undefined) return true;
    const item = queryItemOfParam((request.query as { for?: unknown } | undefined)?.for);
    // The tile's own dashboard first: its stored body is one its writer could show.
    if (item?.kind === 'dashboard') {
      const stored = await openableDashboard(seen, item.id);
      if (stored !== undefined && showsImage(stored.body, imageId)) return true;
    }
    if (await readsImage(seen, imageId)) return true;
    if (item === null || item === undefined) return false;
    if (item.kind === 'dashboard') {
      if ((await historyItem(request, 'dashboard', item.id)) === undefined) return false;
      const kept = (await versions?.list('dashboard', item.id)) ?? [];
      return kept.some((version) => showsImage(version.content, imageId));
    }
    if (item.kind === 'proposal') {
      const proposal = await proposals?.get(item.id);
      const user = userOf(request);
      return (
        proposal != null &&
        (user.superAdmin ||
          proposal.author.key === user.key ||
          proposal.items.every((each) => mayWrite(seen, each.landsIn))) &&
        proposal.items.some((each) => showsImage(each.snapshot, imageId))
      );
    }
    return false;
  };
  /** The charts a dashboard's body shows: its `charts` list and every tile's `chartId` (as `dashboardsUsing` reads it). */
  const chartIdsOf = (body: unknown): Set<string> => {
    const found = new Set<string>();
    const listed = (body as { charts?: unknown } | null)?.charts;
    if (Array.isArray(listed)) for (const id of listed) if (typeof id === 'string') found.add(id);
    const read = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(read);
      else if (value !== null && typeof value === 'object') {
        for (const [key, each] of Object.entries(value)) {
          if (key === 'chartId' && typeof each === 'string') found.add(each);
          else read(each);
        }
      }
    };
    read(body);
    return found;
  };
  /**
   * Whether every chart a dashboard save adds is one the user may open: a
   * chart on a dashboard they can see is theirs to open (AC-263), so adding a
   * hidden one would open it (T326's review).
   */
  const addsOnlyOpenable = async (
    seen: Visibility,
    before: unknown,
    after: unknown,
    dashboardFolder: string | null,
    /**
     * Charts made by the same save (version 0), not stored yet: its own, which
     * the save checks as it makes them, and whose ids, if stored already, the
     * save's transaction refuses (T502's e2e).
     */
    making: ReadonlySet<string> = new Set(),
  ) => {
    const had = chartIdsOf(before);
    for (const id of chartIdsOf(after)) {
      if (had.has(id) || making.has(id)) continue;
      const chart = await docs?.get?.('chart', id);
      if (!chart || !(await mayOpen(seen, 'chart', chart))) return false;
      if (!(await staysInItsWorkspace(chart, dashboardFolder))) return false;
    }
    return true;
  };
  /**
   * A library chart in a workspace is shown only on a dashboard in that same
   * workspace (T343's review, AC-276): on any other, whoever sees the
   * dashboard would open it. A local chart goes with its dashboard.
   */
  const staysInItsWorkspace = async (chart: Stored, dashboardFolder: string | null) => {
    if (typeof chart.body['localToDashboardId'] === 'string') return true;
    const home = await workspaceRootOf(folderIdOf(chart.body));
    return home === null || home === (await workspaceRootOf(dashboardFolder));
  };
  const NOT_THERE = { message: 'No such document' };
  const READ_ONLY =
    'You can view this, but not change it: only its folder’s read-write members can.';
  /**
   * With security on, a stored item the user must be able to open, and, for a
   * change, to write: `undefined` when the reply has been sent — 404, as for
   * an item that isn't there, when they can't open it; 403 when they can open
   * it but not change it. With security off, the item, or 404.
   */
  const itemFor = async (
    request: FastifyRequest,
    reply: FastifyReply,
    kind: 'folder' | 'dashboard' | 'chart',
    id: string,
    need: 'open' | 'write',
  ): Promise<{ stored: Stored | null; seen: Visibility | undefined } | undefined> => {
    // Security off: nothing to check, and nothing read, as in phase 1.
    if (security === 'off') return { stored: null, seen: undefined };
    let stored;
    try {
      stored = await docs?.get?.(kind, id);
    } catch (failure) {
      // As the document GET answers it (AC-181): a known condition, with a reason.
      if (failure instanceof ChartDocumentError) {
        await reply.code(422).send({ error: failure.message });
        return undefined;
      }
      throw failure;
    }
    if (!stored) {
      await reply.code(404).send(NOT_THERE);
      return undefined;
    }
    const seen = await visibilityOf(request);
    if (seen === undefined) return { stored, seen };
    if (!(await mayOpen(seen, kind, stored))) {
      await reply.code(404).send(NOT_THERE);
      return undefined;
    }
    if (need === 'write' && !mayWrite(seen, await governingFolder(kind, stored))) {
      await reply.code(403).send({ error: READ_ONLY });
      return undefined;
    }
    return { stored, seen };
  };

  /**
   * What a query may name for an item: the cubes on folder paths, and what
   * published items name. Built once per query (T340).
   */
  const scopeBuilder = async () => {
    const allowed = new Set<string>();
    const published = folders === undefined ? ROOT_ONLY : await folders();
    const pathsDone = new Set<string | null>();
    return {
      allowed,
      /**
       * The cubes on a folder's path (the root's alone for none), as the
       * editor's picker offers them (AC-329), and as a drill finds a tile's
       * joined cubes (AC-237): they bind along that path.
       */
      path: async (folderId: string | null) => {
        if (pathsDone.has(folderId)) return;
        pathsDone.add(folderId);
        for (const cube of await cubesOnPath(
          folderId,
          published,
          async (at) => (await modelFiles?.list(at)) ?? [],
        ))
          allowed.add(cube);
      },
      names: (cubes: readonly string[]) => {
        for (const cube of cubes) allowed.add(cube);
      },
    };
  };
  /** A stored chart, or none where it is gone or this wechart can't read it (T340's review). */
  const chartOrNone = async (id: string): Promise<Stored | null> => {
    try {
      return (await docs?.get?.('chart', id)) ?? null;
    } catch (failure) {
      if (failure instanceof ChartDocumentError) return null;
      throw failure;
    }
  };
  /**
   * What an item's charts let its queries name: a published chart's own
   * cubes, bound when it was published, and the cubes on its folder's path;
   * a workspace chart's, bound to nothing yet and its author's to write, only
   * those on the shared root's path and its target folder's (AC-329).
   */
  const addChart = async (
    scope: Awaited<ReturnType<typeof scopeBuilder>>,
    chart: Stored,
  ): Promise<void> => {
    const governing = await governingFolder('chart', chart);
    if ((await workspaceRootOf(governing)) !== null) {
      await scope.path(null);
      const target = chart.body['targetFolderId'];
      if (typeof target === 'string') await scope.path(target);
      return;
    }
    scope.names(cubesOfChartBody(chart.body));
    await scope.path(governing);
  };

  /**
   * The cubes and views a query may name, for the item it serves (T340,
   * AC-268): with sign-in on, the item it names, `for: { kind, id }`, must be
   * one the user may open (404 otherwise, as for one that isn't there), and a
   * query naming none is a Super-Admin's alone (400 otherwise). `undefined`
   * when the reply has been sent.
   *
   * The item is bound to the cubes it uses and to those they join through,
   * which bind along its folder's path: a published item's own cubes (bound
   * at publish, so its body is trusted) and those on its folder's path, and
   * the same of each chart a dashboard shows. A workspace item's body is its
   * author's to write and bound to nothing, so it reaches only the cubes on
   * the shared root's path and its target folder's, as its picker offers
   * them (AC-329), and is answered from the published model until T347's
   * overlays.
   */
  const queryScope = async (
    request: FastifyRequest,
    reply: FastifyReply,
    item: QueryItem | undefined | null,
  ): Promise<{ readonly allowed: ReadonlySet<string> | 'all' } | undefined> => {
    if (security === 'off') return { allowed: 'all' };
    if (item === undefined && userOf(request).superAdmin) return { allowed: 'all' };
    if (item === undefined || item === null) {
      await reply.code(400).send({
        error:
          'A query names the item it serves: send for: { kind, id }, the dashboard or the chart it is for.',
      });
      return undefined;
    }
    if (item.kind === 'proposal') return proposalScope(request, reply, item.id);
    const found = await itemFor(request, reply, item.kind, item.id, 'open');
    if (found === undefined) return undefined;
    const stored = found.stored;
    if (stored === null) return { allowed: 'all' };
    const scope = await scopeBuilder();
    if (item.kind === 'chart') {
      await addChart(scope, stored);
      return { allowed: scope.allowed };
    }
    const governing = await governingFolder('dashboard', stored);
    const inWorkspace = (await workspaceRootOf(governing)) !== null;
    if (inWorkspace) {
      await scope.path(null);
      const target = stored.body['targetFolderId'];
      if (typeof target === 'string') await scope.path(target);
    } else {
      scope.names(cubesOfDashboardBody(stored.body));
      await scope.path(governing);
    }
    const charts = [
      ...(await Promise.all([...chartIdsOf(stored.body)].map(chartOrNone))).flatMap((chart) =>
        chart ? [chart] : [],
      ),
      ...((await docs?.localTo?.(stored.id)) ?? []),
    ];
    for (const chart of charts) await addChart(scope, chart);
    return { allowed: scope.allowed };
  };
  /**
   * A proposal's review queries (T340, T356): what it holds, which its
   * reviewer can't open. Opened by its author, the read-write members of
   * every folder it lands in and the Super-Admins, as its route has it
   * (T351); 404 otherwise. What it holds is its author's writing and bound
   * to nothing yet, so it reaches the cubes on each folder it lands in's
   * path, and those of the published charts a proposed dashboard shows.
   */
  const proposalScope = async (
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ): Promise<{ readonly allowed: ReadonlySet<string> } | undefined> => {
    const proposal = await proposals?.get(id);
    const user = userOf(request);
    const seen =
      proposal === null || proposal === undefined ? undefined : await visibilityOf(request);
    const opens =
      proposal !== null &&
      proposal !== undefined &&
      (user.superAdmin ||
        proposal.author.key === user.key ||
        proposal.items.every((each) => seen === undefined || mayWrite(seen, each.landsIn)));
    if (!opens) {
      await reply.code(404).send(NOT_THERE);
      return undefined;
    }
    const scope = await scopeBuilder();
    const proposed = new Set(proposal.items.map((each) => each.id));
    for (const each of proposal.items) {
      await scope.path(each.landsIn);
      if (each.kind !== 'dashboard') continue;
      // A published chart it shows, not one it proposes.
      for (const chartId of chartIdsOf(each.snapshot)) {
        if (proposed.has(chartId)) continue;
        const chart = await chartOrNone(chartId);
        if (chart !== null) await addChart(scope, chart);
      }
    }
    return { allowed: scope.allowed };
  };
  /** A query's first cube outside what its item may use: refused with a 403 (T340). */
  const refusedOutside = async (
    reply: FastifyReply,
    scope: { readonly allowed: ReadonlySet<string> | 'all' },
    query: Record<string, unknown>,
  ): Promise<boolean> => {
    if (scope.allowed === 'all') return false;
    const allowed = scope.allowed;
    const named = cubesQueried(query);
    if (named === undefined) {
      await reply.code(400).send({
        error: 'The query can’t be read: send one query object, naming members by name.',
      });
      return true;
    }
    const outside = named.find((cube) => !allowed.has(cube));
    if (outside === undefined) return false;
    await reply.code(403).send({
      error: `This query names “${outside}”, which the item it serves doesn’t use.`,
    });
    return true;
  };

  /** These visible folders' counts of what the user may see in and beneath them (AC-194). */
  const countsOf = async (seen: Visibility, only: readonly string[]) =>
    visibleCounts(seen, cat?.ownCounts ? await cat.ownCounts() : new Map(), only);

  app.get('/api/folders', USER, async (request) => {
    if (!cat) return [];
    const seen = await visibilityOf(request);
    if (seen === undefined) return cat.folders();
    // Counted here, for what this user may see: the catalog's counts go unasked.
    const folders = (await cat.folders({ counted: false })).filter((folder) =>
      seen.rights.has((folder as { id: string }).id),
    ) as { id: string }[];
    const counts = await countsOf(
      seen,
      folders.map((folder) => folder.id),
    );
    return folders.map((folder) => ({ ...folder, itemCount: counts.get(folder.id) ?? 0 }));
  });
  /**
   * The folders an item made in the workspace may go to (T345, AC-282; rule
   * 74): the shared folders, the root among them, where the user has
   * read-write access, each with its path from the root. Never a workspace's.
   */
  app.get('/api/folders/targets', USER, async (request) => {
    if (!cat) return [];
    const seen = await visibilityOf(request);
    const all = (await cat.folders({ counted: false })) as {
      id: string;
      title: string;
      parentId: string | null;
    }[];
    const byId = new Map(all.map((folder) => [folder.id, folder]));
    const pathOf = (id: string) => {
      const path: string[] = [];
      for (let at = byId.get(id); at !== undefined && path.length <= all.length;) {
        path.unshift(at.title);
        at = at.parentId === null ? undefined : byId.get(at.parentId);
      }
      return path;
    };
    const writes = (id: string) => seen === undefined || mayWrite(seen, id);
    /** Whether it sits in a workspace, walked up the folders already read. */
    const inAWorkspace = (id: string) => {
      const passed = new Set<string>();
      for (let at: string | null | undefined = id; at != null && !passed.has(at);) {
        if (isWorkspaceId(at)) return true;
        passed.add(at);
        at = byId.get(at)?.parentId;
      }
      return false;
    };
    return [
      ...(writes(ROOT_FOLDER_ID) ? [{ id: ROOT_FOLDER_ID, path: [] as string[] }] : []),
      ...all
        .filter((folder) => !inAWorkspace(folder.id) && writes(folder.id))
        .map((folder) => ({ id: folder.id, path: pathOf(folder.id) }))
        .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'))),
    ];
  });
  // The roots the user has, with their counts, which are no folder's (AC-194).
  app.get('/api/folder-roots', USER, async (request) => {
    const seen = await visibilityOf(request);
    if (seen === undefined) return cat?.rootCounts ? cat.rootCounts() : {};
    // The shared root only where a grant lets them see it (T331, AC-194;
    // design 09, state G): someone no grant reaches has no root to be shown.
    // My workspace is each user's own (T343, AC-276), and none of a user with
    // read-only access everywhere (AC-277).
    const own = workspaceIdOf(userOf(request).key);
    const counts = await countsOf(seen, [ROOT_FOLDER_ID, own]);
    return {
      ...(seen.rights.has(ROOT_FOLDER_ID)
        ? { [ROOT_FOLDER_ID]: counts.get(ROOT_FOLDER_ID) ?? 0 }
        : {}),
      ...(seen.rights.has(own) ? { [MY_WORKSPACE_ID]: counts.get(own) ?? 0 } : {}),
    };
  });

  app.get('/api/folders/:folderId/contents', USER, async (request, reply) => {
    const { folderId } = request.params as { folderId: string };
    if (!cat) return [];
    const seen = await visibilityOf(request);
    if (seen === undefined) return cat.contents(folderId);
    // My workspace is named by its owner's `ws:` id by now (T343): anyone
    // else's, like a read-only user's none, has no right below and isn't there.
    const right = seen.rights.get(folderId);
    // Explore opens on the shared root: for someone no grant reaches, it holds
    // nothing, rather than being an error (T325's review).
    if (right === undefined && folderId === ROOT_FOLDER_ID) return [];
    // Any other folder they may not see answers as one that isn't there (AC-264).
    if (right === undefined) {
      return reply.code(404).send({ error: 'There’s no such folder, or it isn’t yours to see.' });
    }
    const rows = (
      (await cat.contents(folderId, { counted: false })) as { kind: string; id: string }[]
    ).filter((row) =>
      row.kind === 'folder'
        ? seen.rights.has(row.id)
        : row.kind === 'dashboard' || right.kinds === 'all',
    );
    const counts = await countsOf(
      seen,
      rows.filter((row) => row.kind === 'folder').map((row) => row.id),
    );
    return rows.map((row) =>
      row.kind === 'folder' ? { ...row, itemCount: counts.get(row.id) ?? 0 } : row,
    );
  });

  /**
   * "Edit in my workspace" (T344; AC-278, AC-279): a shared dashboard or
   * library chart copied into the user's own workspace, or their copy already
   * there opened (200, `created: false`). Only for one they may propose back:
   * a read-write member of its folder, who has a workspace (AC-277, AC-284).
   * A local chart goes with its dashboard; what is in a workspace is edited
   * there. With sign-in off there are no workspaces.
   */
  app.post('/api/workspace/copies', USER, async (request, reply) => {
    const seen = await visibilityOf(request);
    if (seen === undefined || !docs?.get || !docs.createTogether || !docs.withOrigin)
      return reply.code(404).send({ error: 'Workspaces need sign-in.' });
    const body = request.body as { kind?: unknown; id?: unknown } | undefined;
    const kind = body?.kind;
    const id = body?.id;
    if ((kind !== 'dashboard' && kind !== 'chart') || typeof id !== 'string' || id === '')
      throw new BadRequest('Name the dashboard or chart to copy: { kind, id }.');
    const own = workspaceIdOf(userOf(request).key);
    if (!seen.rights.has(own))
      return reply.code(403).send({
        error: 'You have no workspace: only read-write members and Super-Admins have one.',
      });
    // A stored item this version can't read is said so, as the document GET
    // says it, never taken for one that isn't there (T344's review).
    const read = async (what: 'dashboard' | 'chart', which: string) => {
      try {
        return { found: await docs.get!(what, which) };
      } catch (failure) {
        if (failure instanceof ChartDocumentError) return { unreadable: failure.message };
        throw failure;
      }
    };
    const item = await read(kind, id);
    if (item.unreadable !== undefined) return reply.code(422).send({ error: item.unreadable });
    const stored = item.found ?? null;
    if (stored === null || !(await mayOpen(seen, kind, stored)))
      return reply.code(404).send(NOT_THERE);
    if (kind === 'chart' && typeof stored.body['localToDashboardId'] === 'string')
      throw new BadRequest('A chart on a dashboard is copied with its dashboard.');
    const home = folderIdOf(stored.body);
    if ((await workspaceRootOf(home)) !== null)
      throw new BadRequest('It is in a workspace already: edit it there.');
    if (home === null || !mayWrite(seen, home)) return reply.code(403).send({ error: READ_ONLY });

    // Their copies, wherever in their workspace they are.
    const mine = [own, ...(await foldersBeneath(own)).map((folder) => folder.id)];
    const copyOf = async (what: 'dashboard' | 'chart', originId: string) =>
      (await docs.withOrigin!(what, originId, mine))[0];
    // Their copy, if there is one, opens instead: never a second.
    const existing = await copyOf(kind, id);
    if (existing !== undefined) return { kind, id: existing.id, created: false };

    const owner = userOf(request).key;
    let copies;
    if (kind === 'dashboard') {
      /**
       * What each chart it shows becomes (T344's review): one its copier
       * can't open refuses the copy, rather than landing in their workspace;
       * one they have a copy of already is that copy; a library chart they
       * may propose back is copied as one; any other becomes the copy's own
       * local chart, so nothing else governs it.
       */
      const shown: ShownCopy[] = [];
      for (const chartId of chartIdsOf(stored.body)) {
        const chart = await read('chart', chartId);
        if (chart.unreadable !== undefined)
          return reply.code(422).send({ error: chart.unreadable });
        if (chart.found == null) continue;
        const found = chart.found;
        if (!(await mayOpen(seen, 'chart', found)))
          return reply.code(409).send({
            error: 'It shows a chart you can’t open, so it can’t be copied into your workspace.',
          });
        const folder = folderIdOf(found.body);
        const library = typeof found.body['localToDashboardId'] !== 'string';
        const reused = library ? await copyOf('chart', found.id) : undefined;
        if (reused !== undefined) shown.push({ as: 'reuse', chart: found, copyId: reused.id });
        else if (library && folder !== null && mayWrite(seen, folder))
          shown.push({ as: 'library', chart: found });
        else
          shown.push({
            as: 'local',
            chart: found,
            folderSeen: folder !== null && seen.rights.has(folder),
          });
      }
      copies = dashboardCopies(stored, shown, own, owner, () => randomUUID());
    } else copies = [chartCopy(stored, own, owner, () => randomUUID())];
    await docs.createTogether(copies);
    return reply.code(201).send({ kind, id: copies[0]!.id, created: true });
  });

  /**
   * A shared item's history (T354, AC-289; design 06; rule 80): its last 10
   * versions, newest first, each with its number, time, author, approver and
   * description, for its folder's read-write members and Super-Admins alone.
   * Anyone else finds none, as for an item that isn't there. One version's
   * content is asked for alone, to be viewed.
   */
  const HISTORY_KINDS = ['dashboard', 'chart', 'data-source'] as const;
  type HistoryKind = (typeof HISTORY_KINDS)[number];
  const NO_HISTORY = { error: 'There is no such item, or its history isn’t yours to see.' };
  const historyItem = async (request: FastifyRequest, kind: HistoryKind, id: string) => {
    const seen = await visibilityOf(request);
    // With sign-in off there are no approvals, so no history (T359 brings the single user's).
    if (seen === undefined || versions === undefined) return undefined;
    let folderId: string | null;
    let current: number;
    let title: unknown;
    if (kind === 'data-source') {
      const source = await dataSources?.get(id);
      if (source == null) return undefined;
      folderId = source.folderId;
      current = source.version;
      title = source.name;
    } else {
      const stored = await docs?.get?.(kind, id).catch(() => null);
      if (stored == null) return undefined;
      // A dashboard's own chart has its dashboard's history.
      if (kind === 'chart' && typeof stored.body['localToDashboardId'] === 'string')
        return undefined;
      folderId = folderIdOf(stored.body);
      current = stored.version ?? 1;
      title = stored.body['title'];
    }
    // A shared item's alone: a workspace's has no history (AC-289).
    if (folderId === null || (await workspaceRootOf(folderId)) !== null) return undefined;
    if (!userOf(request).superAdmin && !mayWrite(seen, folderId)) return undefined;
    return { seen, folderId, current, title };
  };
  const historyKindOf = (kind: string): HistoryKind | undefined =>
    (HISTORY_KINDS as readonly string[]).includes(kind) ? (kind as HistoryKind) : undefined;

  app.get('/api/history/:kind/:id', USER, async (request, reply) => {
    const { kind: asked, id } = request.params as { kind: string; id: string };
    const kind = historyKindOf(asked);
    const item = kind === undefined ? undefined : await historyItem(request, kind, id);
    if (kind === undefined || item === undefined) return reply.code(404).send(NO_HISTORY);
    const kept = await versions!.list(kind, id);
    return {
      current: item.current,
      versions: kept.map((each) => ({
        version: each.version,
        at: each.at,
        title: each.title,
        author: each.author,
        approver: each.approver,
        description: each.description,
        proposalId: each.proposalId,
        // The item's own version; or, where a rename or move has moved it on
        // since without a version (AC-291), the newest kept (T354's review).
        current:
          each.version === item.current ||
          (each === kept[0] && !kept.some((one) => one.version === item.current)),
      })),
    };
  });

  app.get('/api/history/:kind/:id/versions/:version', USER, async (request, reply) => {
    const {
      kind: asked,
      id,
      version,
    } = request.params as {
      kind: string;
      id: string;
      version: string;
    };
    const kind = historyKindOf(asked);
    const item = kind === undefined ? undefined : await historyItem(request, kind, id);
    if (kind === undefined || item === undefined) return reply.code(404).send(NO_HISTORY);
    const kept = /^\d{1,9}$/.test(version) ? await versions!.get(kind, id, Number(version)) : null;
    if (kept === null) return reply.code(404).send({ error: 'There is no such version kept.' });
    const content = kept.content as { body?: Record<string, unknown>; parts?: unknown };
    return {
      version: kept.version,
      at: kept.at,
      title: kept.title,
      author: kept.author,
      approver: kept.approver,
      description: kept.description,
      current: kept.version === item.current,
      // A data source's settings, each credential only named (rule 83).
      content:
        kind === 'data-source'
          ? {
              body: {
                ...Object.fromEntries(
                  ['name', 'driver', 'authMethod', 'fields', 'description']
                    .filter((key) => content.body !== undefined && key in content.body)
                    .map((key) => [key, content.body![key]]),
                ),
                secrets: Object.keys(
                  (content.body?.['sealed'] as Record<string, unknown> | undefined) ?? {},
                ),
              },
              // Each credential against the one stored now, compared sealed,
              // never opened: "unchanged" or "replaced" (T515; design 06, state D).
              secretChanges: await (async () => {
                const now = (await dataSources?.withSealed(id))?.landed.sealed ?? {};
                const then =
                  (content.body?.['sealed'] as Record<string, unknown> | undefined) ?? {};
                return Object.fromEntries(
                  Object.entries(then).map(([field, envelope]) => [
                    field,
                    JSON.stringify(envelope) ===
                    JSON.stringify((now as Record<string, unknown>)[field])
                      ? 'unchanged'
                      : 'replaced',
                  ]),
                );
              })(),
            }
          : { body: content.body ?? {}, parts: content.parts ?? [] },
    };
  });

  /**
   * Restoring a version (T354, AC-289; design 06, state C): a draft of it in
   * the user's workspace, copied from the item as it is now, so the usual
   * proposal replaces the item with it. Nothing in the folder changes until
   * that proposal is approved. A dashboard's own charts come back as they
   * were; a library chart it showed is the folder's, as it is now.
   */
  app.post('/api/history/:kind/:id/restore', USER, async (request, reply) => {
    const { kind: asked, id } = request.params as { kind: string; id: string };
    const kind = historyKindOf(asked);
    const item = kind === undefined ? undefined : await historyItem(request, kind, id);
    if (kind === undefined || item === undefined) return reply.code(404).send(NO_HISTORY);
    const number = (request.body as { version?: unknown } | undefined)?.version;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 1)
      throw new BadRequest('Name the version to restore: { version }.');
    const kept = await versions!.get(kind, id, number);
    if (kept === null) return reply.code(404).send({ error: 'There is no such version kept.' });
    /**
     * A data source's version (T515, AC-289, AC-158; design 06, state D): a
     * draft in the workspace, a copy of it as it is now, holding that
     * version's settings and its credentials as sealed, never opened. It is
     * proposed only once a test of those settings passes (`untested` in the
     * proposals), and the folder's stays as it is until approved.
     */
    if (kind === 'data-source') {
      if (dataSources === undefined) return reply.code(404).send(NO_HISTORY);
      const own = workspaceIdOf(userOf(request).key);
      if (!item.seen.rights.has(own))
        return reply.code(403).send({
          error: 'You have no workspace: only read-write members and Super-Admins have one.',
        });
      const current = await dataSources.get(id);
      if (current === undefined) return reply.code(404).send(NO_HISTORY);
      const then = (kept.content as { body?: Record<string, unknown> }).body ?? {};
      // Its type never changes (AC-161): a version of another is none to restore.
      if (then['driver'] !== current.driver)
        return reply.code(409).send({
          error:
            'That version is of another type of database, and a data source’s type never changes.',
        });
      const mine = new Set([own, ...(await foldersBeneath(own)).map((folder) => folder.id)]);
      const existing = (await dataSources.all()).find(
        (source) => source.origin?.id === id && mine.has(source.folderId),
      );
      if (existing !== undefined) {
        if ((await proposals?.openFor('data-source', existing.id)) != null)
          return reply.code(409).send({
            error:
              'Your copy of it is waiting for review: decide or withdraw that proposal before restoring another version.',
            id: existing.id,
            replaceable: false,
          });
        if ((request.body as { replaceCopy?: unknown }).replaceCopy !== true)
          return reply.code(409).send({
            error:
              'You have a copy of it in your workspace. Restoring this version replaces what that copy holds.',
            id: existing.id,
            replaceable: true,
          });
      }
      // That version's settings and its credentials, exactly: none the
      // version didn't have (T515's review).
      const shape = {
        driver: current.driver,
        authMethod: typeof then['authMethod'] === 'string' ? then['authMethod'] : '',
        fields: (then['fields'] ?? {}) as Record<string, FieldValue>,
        sealed: (then['sealed'] ?? {}) as Record<string, SealedV1>,
      };
      /**
       * Everything that can refuse it asked first, so a refusal leaves the
       * user's copy as it was (T515's review): the version's settings and its
       * envelopes' key, as a save of them would be, and a name My
       * workspace's root holds already.
       */
      try {
        dataSources.checkShape(shape);
        await dataSources.plan(id, {
          authMethod: shape.authMethod,
          fields: shape.fields,
          sealed: shape.sealed,
        });
      } catch (failure) {
        if (failure instanceof DataSourceRefused)
          return reply.code(failure.status).send({
            error: `That version can’t be restored as it was kept: ${failure.message}`,
          });
        throw failure;
      }
      const named = (await dataSources.inFolder(own)).find(
        (source) => source.name === current.name && source.id !== existing?.id,
      );
      if (named !== undefined)
        return reply.code(409).send({
          error: `My workspace already has a data source named ${current.name}: rename or discard it first.`,
        });
      if (existing !== undefined) await dataSources.remove(existing.id);
      let draft;
      try {
        draft = await dataSources.create({
          folderId: own,
          name: current.name,
          ...shape,
          targetFolderId: current.folderId,
        });
        await dataSources.setOrigin(draft.id, {
          id: current.id,
          version: current.version,
          folderId: current.folderId,
        });
        if (typeof then['description'] === 'string' && then['description'] !== '')
          draft = await dataSources.update(draft.id, { description: then['description'] });
      } catch (failure) {
        if (failure instanceof DataSourceRefused)
          return reply.code(failure.status).send({ error: failure.message });
        throw failure;
      }
      await recordIn(
        audit,
        {
          actor: actorOf(userOf(request)),
          event: 'restore',
          folderId: item.folderId,
          item: { kind, id, title: current.name },
          summary: `Restoring “${current.name}” to version ${String(number)}, as a draft to propose`,
          details: { version: number, draftId: draft.id },
        },
        request.log,
      );
      return reply.code(201).send({ kind, id: draft.id });
    }
    if (!docs?.get || !docs.createTogether || !docs.withOrigin)
      return reply.code(404).send(NO_HISTORY);
    const own = workspaceIdOf(userOf(request).key);
    if (!item.seen.rights.has(own))
      return reply.code(403).send({
        error: 'You have no workspace: only read-write members and Super-Admins have one.',
      });
    const mine = [own, ...(await foldersBeneath(own)).map((folder) => folder.id)];
    const content = kept.content as {
      body: Record<string, unknown>;
      parts?: readonly { readonly id: string; readonly body: Record<string, unknown> }[];
    };
    // That version's content, copied from the item as it is now, under its
    // name now: a name changes at once, never by proposal (AC-291), and the
    // proposal replaces the item of its name (AC-288).
    const asNow = {
      id,
      body: { ...content.body, folderId: item.folderId, title: item.title },
      version: item.current,
    };
    const owner = userOf(request).key;
    let copies;
    if (kind === 'dashboard') {
      const parts = new Map((content.parts ?? []).map((part) => [part.id, part.body]));
      const shown: ShownCopy[] = [];
      for (const chartId of chartIdsOf(content.body)) {
        const part = parts.get(chartId);
        if (part !== undefined) {
          shown.push({ as: 'local', chart: { id: chartId, body: part }, folderSeen: true });
          continue;
        }
        // A library chart: the folder's as it is now, or the user's copy of
        // it; one they can't open refuses the restore, as a copy is refused
        // (T354's review), so no draft shows what isn't theirs to see.
        const found = await docs.get('chart', chartId).catch(() => null);
        if (found == null) continue;
        if (!(await mayOpen(item.seen, 'chart', found)))
          return reply.code(409).send({
            error:
              'That version shows a chart you can’t open, so it can’t be restored into your workspace.',
          });
        const reused = (await docs.withOrigin('chart', found.id, mine))[0];
        if (reused !== undefined) shown.push({ as: 'reuse', chart: found, copyId: reused.id });
      }
      copies = dashboardCopies(asNow, shown, own, owner, () => randomUUID());
    } else copies = [chartCopy(asNow, own, owner, () => randomUUID())];

    // The user's copy of it, which the draft replaces (T354's review): only
    // when asked, since what it holds goes, and never while it waits for
    // review.
    const existing = (await docs.withOrigin(kind, id, mine))[0];
    if (existing !== undefined) {
      if ((await proposals?.openFor(kind, existing.id)) != null)
        return reply.code(409).send({
          error:
            'Your copy of it is waiting for review: decide or withdraw that proposal before restoring another version.',
          id: existing.id,
          replaceable: false,
        });
      if ((request.body as { replaceCopy?: unknown }).replaceCopy !== true)
        return reply.code(409).send({
          error:
            'You have a copy of it in your workspace. Restoring this version replaces what that copy holds.',
          id: existing.id,
          replaceable: true,
        });
      if (!docs.remove) return reply.code(404).send(NO_HISTORY);
      // A dashboard's own charts go with it.
      if (kind === 'dashboard' && docs.localTo)
        for (const chart of await docs.localTo(existing.id)) await docs.remove('chart', chart.id);
      await docs.remove(kind, existing.id);
    }
    await docs.createTogether(copies);
    // In the audit trail, in its folder (AC-294): what is restored, to which version.
    await recordIn(
      audit,
      {
        actor: actorOf(userOf(request)),
        event: 'restore',
        folderId: item.folderId,
        item: { kind, id, title: typeof item.title === 'string' ? item.title : '' },
        summary: `Restoring “${typeof item.title === 'string' ? item.title : ''}” to version ${String(number)}, as a draft to propose`,
        details: { version: number, draftId: copies[0]!.id },
      },
      request.log,
    );
    return reply.code(201).send({ kind, id: copies[0]!.id });
  });

  /**
   * Create a folder, dashboard or chart in a folder (AC-020). The id is minted
   * here rather than accepted from the browser, so a client cannot choose to
   * overwrite an existing object by claiming its id.
   */
  app.post('/api/documents', USER, async (request, reply) => {
    const owner = userOf(request).key;
    const body = request.body as { kind?: string; title?: string; folderId?: string } | undefined;

    const kind = body?.kind;
    const title = body?.title?.trim();

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!title) throw new BadRequest('A title is required');
    if (!docs) throw new BadRequest('Persistence is not configured');

    const folderId = body?.folderId ?? 'root';

    // With security on, only in a folder they may write in (T326, AC-266): one
    // they can't see answers as one that isn't there. The shared root always
    // is, and so is My workspace to someone who has none (T343, AC-277).
    const seen = await visibilityOf(request);
    if (seen !== undefined && !mayWrite(seen, folderId)) {
      const isRoot =
        folderId === ROOT_FOLDER_ID ||
        folderId === MY_WORKSPACE_ID ||
        folderId === workspaceIdOf(userOf(request).key);
      return !isRoot && !seen.rights.has(folderId)
        ? reply.code(404).send(NOT_THERE)
        : reply.code(403).send({ error: READ_ONLY });
    }

    /**
     * A dashboard or chart made in the workspace names the shared folder it
     * is to go to, one its author may write in (T345, AC-282; rule 74). A
     * folder in the workspace goes nowhere.
     */
    let targetFolderId: string | undefined;
    if (seen !== undefined && kind !== 'folder' && (await workspaceRootOf(folderId)) !== null) {
      const target = (request.body as { targetFolderId?: unknown }).targetFolderId;
      const targetsWorkspace =
        typeof target === 'string' && target !== '' ? await workspaceRootOf(target) : null;
      // Another's workspace is as a folder that isn't there (T345's review).
      if (targetsWorkspace !== null && targetsWorkspace !== workspaceIdOf(owner))
        return reply.code(404).send(NOT_THERE);
      if (typeof target !== 'string' || target === '' || targetsWorkspace !== null)
        throw new BadRequest(
          'Name the shared folder it is to go to: one where you have read-write access.',
        );
      if (!mayWrite(seen, target))
        return seen.rights.has(target)
          ? reply.code(403).send({ error: READ_ONLY })
          : reply.code(404).send(NOT_THERE);
      targetFolderId = target;
    }

    // One dashboard of a name in a folder (T336, AC-270).
    if (kind === 'dashboard') {
      const taken = await dashboardNamed(folderId, title);
      if (taken !== undefined) return reply.code(409).send(taken);
    }

    /**
     * A dashboard is created with its interaction mode and its default
     * marking already in it (AC-072, direction.md rule 57), not left to be
     * defaulted when something reads it. The browser does default a dashboard
     * that has none — every dashboard stored before interactions existed —
     * but relying on that would make the criterion unobservable: every
     * dashboard would read as Markings whether or not anything was written.
     *
     * Only a dashboard. Writing marking definitions onto a chart or a folder
     * would be a quiet lie about what those are.
     */
    const created = await docs.create({
      kind,
      id: randomUUID(),
      body: {
        ...(kind === 'dashboard'
          ? { ...newDashboardBody({ title, folderId, owner }) }
          : { title, folderId, owner }),
        ...(targetFolderId === undefined ? {} : { targetFolderId }),
      },
    });

    return reply.status(201).send({
      kind,
      id: created.id,
      title,
      folderId: body?.folderId ?? 'root',
    });
  });

  /**
   * Rename or move (AC-021). The id is not part of what can change, so every
   * reference to the object keeps working: a dashboard points at a chart's id,
   * never at its title or its folder.
   */
  /**
   * One saved document (AC-018). The body is returned as stored, having been
   * through the repository's migration on read, so the browser never sees an
   * older format.
   */
  app.get('/api/documents/:kind/:id', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.get) throw new BadRequest('Persistence is not configured');

    /**
     * A stored chart this version cannot read — from a newer format, or with
     * no upgrade registered — is refused *saying so* (AC-181). The repo raises
     * `ChartDocumentError` while upgrading on read; left to the generic error
     * handler it became a 500 "Internal error", and the sentence explaining
     * the refusal was produced and then discarded, so the browser reported a
     * chart that exists as broken.
     *
     * **Here, and only here.** The repo also reads a document back *after*
     * writing it, so on a save or a rename the same error arrives once the
     * write has committed. Mapped globally, that answered a successful write
     * with a 4xx — "nothing was written" — which is false.
     *
     * 422 on a read: the request is sound and nothing broke; the stored
     * content is one this build cannot read, a known condition with a reason.
     * Safe to pass through — the message is authored in `@wechart/core` and
     * built from version numbers only, so none of the service's environment
     * can ride along with it (AC-007).
     */
    let found;
    try {
      found = await docs.get(kind, id);
    } catch (failure) {
      if (failure instanceof ChartDocumentError) {
        return reply.code(422).send({ error: failure.message });
      }
      throw failure;
    }
    if (found === null) return reply.code(404).send(NOT_THERE);
    // With security on, one they may not open answers as one that isn't there
    // (T326, AC-263, AC-264).
    const seen = await visibilityOf(request);
    if (seen !== undefined && !(await mayOpen(seen, kind, found))) {
      return reply.code(404).send(NOT_THERE);
    }
    // A folder's groups are its writers' to see, as its Access panel is (T314):
    // not a reader's, through the document (T326's review).
    if (seen !== undefined && kind === 'folder' && !mayWrite(seen, id)) {
      const { access: _groups, ...body } = found.body;
      void _groups;
      return { ...found, body };
    }
    /**
     * Where a dashboard or library chart is edited, for its header (T348,
     * AC-278; design 04, states E and F): in the workspace it is in, or, for
     * a shared one, in a copy there — the user's copy, once they have one.
     * A chart's only when its page asks (`?place`): a tile's read, one per
     * chart on a dashboard, needs none of it (T348's review). A chart local to
     * a dashboard is where its dashboard is.
     */
    const { place } = request.query as { place?: string };
    if (seen !== undefined && (kind === 'dashboard' || (kind === 'chart' && place !== undefined))) {
      const home = await governingFolder(kind, { id, body: found.body });
      const own = workspaceIdOf(userOf(request).key);
      const inWorkspace = (await workspaceRootOf(home)) !== null;
      const local = kind === 'chart' && typeof found.body['localToDashboardId'] === 'string';
      const mayCopy =
        !inWorkspace && !local && home !== null && seen.rights.has(own) && mayWrite(seen, home);
      const mine = mayCopy ? [own, ...(await foldersBeneath(own)).map((folder) => folder.id)] : [];
      const copyId =
        mayCopy && docs?.withOrigin
          ? ((await docs.withOrigin(kind, id, mine))[0]?.id ?? null)
          : null;
      return { ...found, workspace: { inWorkspace, mayCopy, copyId } };
    }
    return found;
  });

  /**
   * Save a document's body (AC-065).
   *
   * The whole body, replaced as given. Saving field by field would mean the
   * server had to know the shape of every document kind, and anything the
   * browser learned to store before the server learned about it would be
   * dropped on the next save — a dashboard's markings being exactly that
   * case, since they arrive later than this route.
   *
   * `version` is required and carried through to the repository, which
   * refuses a write against a version that has moved. Two people editing one
   * dashboard would otherwise have the last save win silently.
   */
  app.put('/api/documents/:kind/:id', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const body = request.body as { body?: Record<string, unknown>; version?: number } | undefined;

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.update) throw new BadRequest('Persistence is not configured');
    if (body?.body === undefined) throw new BadRequest('A body is required');
    if (typeof body.version !== 'number') {
      throw new BadRequest('A version is required, so a stale save can be refused');
    }

    // With security on, only an item they may change, and not into a folder
    // they may not (T326, AC-266).
    const found = await itemFor(request, reply, kind, id, 'write');
    if (found === undefined) return reply;
    if (found.seen !== undefined && found.stored !== null) {
      const { seen, stored } = found;
      // Where the item goes, by the folder that governs it — a local chart's
      // dashboard's — must be theirs too (T326's review).
      const moved =
        kind === 'folder'
          ? folderIdOf(body.body) !== folderIdOf(stored.body) &&
            !mayMoveFolder(seen, id, folderIdOf(stored.body), folderIdOf(body.body))
          : (await governingFolder(kind, { id, body: body.body })) !==
              (await governingFolder(kind, stored)) &&
            !mayWrite(seen, await governingFolder(kind, { id, body: body.body }));
      if (moved) return reply.code(403).send({ error: READ_ONLY });
      // Never across a workspace's edge (T343's review).
      const [from, to] =
        kind === 'folder'
          ? [folderIdOf(stored.body), folderIdOf(body.body)]
          : [
              await governingFolder(kind, stored),
              await governingFolder(kind, { id, body: body.body }),
            ];
      if (from !== to && (await crossesWorkspace(from, to)))
        return reply.code(409).send(ACROSS_WORKSPACE);
      // As a PATCH moves it: no models or data sources into a workspace (T343's review).
      if (kind === 'folder' && from !== to && to !== null) {
        const refusal = await intoWorkspaceRefusal(id, to);
        if (refusal !== undefined) return reply.code(409).send(refusal);
      }
      // A dashboard shows only charts they may open (T326's review).
      if (
        kind === 'dashboard' &&
        !(await addsOnlyOpenable(seen, stored.body, body.body, folderIdOf(body.body)))
      ) {
        return reply.code(403).send({ error: 'This dashboard can show only charts you may open.' });
      }
      // And only images they may see (T408's review).
      if (kind === 'dashboard' && !(await addsOnlyReadableImages(seen, stored.body, body.body)))
        return reply.code(403).send(IMAGES_REFUSED);
      // A shared one's content changes through a proposal, never here (T502,
      // AC-278); moving or renaming it is no change to its content. Asked
      // after what they may not do at all, which says more.
      if (
        kind !== 'folder' &&
        (await isShared(kind, stored)) &&
        !isDeepStrictEqual(contentOf(body.body), contentOf(stored.body))
      )
        return reply.code(409).send(sharedInPlace(kind));
    }

    // A folder's AD groups are the access route's alone (T314's review): kept
    // as stored, whatever this body says or leaves out, so saving a folder
    // can neither grant access nor take it away.
    let written = body.body;
    if (kind === 'folder') {
      const { access: _sent, ...rest } = body.body;
      void _sent;
      const stored = found.stored ?? (await docs.get?.('folder', id));
      written =
        stored?.body['access'] === undefined ? rest : { ...rest, access: stored.body['access'] };
    } else {
      // A stored chart this build can't read is upgraded by this save, as before.
      const stored = found.stored ?? (await docs.get?.(kind, id).catch(() => null));
      written = withStoredTarget(written, stored?.body);
    }

    // Never a second dashboard of its name in its folder (T336, AC-270).
    if (kind === 'dashboard') {
      const was = found.stored ?? (await docs.get?.(kind, id).catch(() => null)) ?? null;
      const taken = await dashboardNamed(
        folderIdOf(written),
        written['title'],
        id,
        was === null ? undefined : { folderId: folderIdOf(was.body), title: was.body['title'] },
      );
      if (taken !== undefined) return reply.code(409).send(taken);
    }

    // Each library chart it shows from off its path, as its own copy (T527, AC-371).
    const copies =
      kind === 'dashboard'
        ? await copiesOnUse({ id, body: written }, chartIdsOf(written))
        : new Map();
    if (copies.size > 0) {
      // Made with it in one write, or not shown at all (T527's review).
      if (docs.updateTogether === undefined) throw new BadRequest('Persistence is not configured');
      written = withChartsRenamed(written, renamesOf(copies)) as typeof written;
    }

    // Published into its folder: each cube it names bound there (T429, AC-272).
    if (kind !== 'folder') {
      const bound = await boundIn(
        kind,
        await governingFolder(kind, { id, body: written }),
        written,
      );
      if (bound.kind !== 'ok') return bindingRefused(reply, kind, bound);
      written = bound.body;
      // Nor bound anew in place: a shared one is published again only by an
      // approval (T502, AC-278, AC-275), which binds it (`bind` in proposals).
      if (
        found.seen !== undefined &&
        found.stored !== null &&
        (await isShared(kind, found.stored)) &&
        !isDeepStrictEqual(contentOf(written), contentOf(found.stored.body))
      )
        return reply.code(409).send(sharedInPlace(kind));
    }

    try {
      if (copies.size === 0 || docs.updateTogether === undefined)
        return await docs.update({ kind, id, body: written, expectedVersion: body.version });
      // The copies made with it, or none of it (T527).
      const folder = await governingFolder(kind, { id, body: written });
      const charts = [];
      for (const copy of copies.values()) {
        const bound = await boundIn('chart', folder, copy.body);
        if (bound.kind !== 'ok') return bindingRefused(reply, 'chart', bound);
        charts.push({ kind: 'chart' as const, id: copy.id, body: bound.body, expectedVersion: 0 });
      }
      const together = await docs.updateTogether([
        ...charts,
        { kind, id, body: written, expectedVersion: body.version },
      ]);
      return { ...together[charts.length], copied: copiedOf(copies) };
    } catch (failure) {
      // A save that lost a race is not a server fault; the browser has to
      // reload and decide what to do, which it cannot if this is a 500.
      if (failure instanceof Error && failure.name === 'StaleDocumentError') {
        return reply.code(409).send({ message: failure.message });
      }
      if (failure instanceof Error && failure.name === 'DocumentNotFoundError') {
        return reply.code(404).send({ message: failure.message });
      }
      throw failure;
    }
  });

  /**
   * Save a dashboard together with the charts edited from its tiles (T192,
   * AC-183: the chart document is written "only when the dashboard is
   * saved").
   *
   * One request and one transaction (`updateTogether`), because two requests
   * have no safe order: charts first leaves them changed if the dashboard then
   * fails — AC-183's failing state — and dashboard first loses the edit if a
   * chart then fails. Every document is version-checked, so a chart or the
   * dashboard changed elsewhere is refused rather than overwritten.
   *
   * **Which charts:** those local to this dashboard, those it is saving to a
   * folder (T133, AC-127) — sent back as library charts, or made new straight
   * into one — and library charts, saved everywhere they are used once the
   * editor has said they are shared and offered a local copy (T134, AC-128;
   * the user's decision). Never a chart local to another dashboard, which is
   * that dashboard's to save, nor a library chart made local, which would
   * take it from the others. The browser holds Save back by the same rule
   * (`whyUnsaveable`). `PUT /api/documents/:kind/:id` also writes any chart.
   *
   * Locality is read before the transaction, and only at the version the
   * client read (409 otherwise). Any later change to the chart, including
   * making it a library chart, moves its version, and the version-checked
   * write inside the transaction then refuses it.
   */
  app.put('/api/dashboards/:id', USER, async (request, reply) => {
    const { id: dashboardId } = request.params as { id: string };
    const payload = request.body as { dashboard?: unknown; charts?: unknown } | undefined;

    if (!docs?.updateTogether || !docs.get) throw new BadRequest('Persistence is not configured');

    const dashboard = payload?.dashboard as { body?: unknown; version?: unknown } | undefined;
    if (
      typeof dashboard !== 'object' ||
      dashboard === null ||
      typeof dashboard.body !== 'object' ||
      dashboard.body === null ||
      typeof dashboard.version !== 'number' ||
      // Stored, so at 1 or later: version 0 would create it, and a dashboard
      // is created by POST /api/documents, its id and defaults the server's
      // (T132's review).
      dashboard.version < 1
    ) {
      throw new BadRequest('A dashboard body and the version it was read at are required');
    }
    if (!Array.isArray(payload?.charts)) throw new BadRequest('charts must be a list');

    // With security on, a dashboard they may change (T326, AC-266); the charts
    // saved with it are checked below.
    const found = await itemFor(request, reply, 'dashboard', dashboardId, 'write');
    if (found === undefined) return reply;
    if (found.seen !== undefined && found.stored !== null) {
      const { seen, stored } = found;
      const into = folderIdOf(dashboard.body as Record<string, unknown>);
      // Moved only into a folder they may write in, and showing only charts
      // they may open (T326's review).
      if (into !== folderIdOf(stored.body) && !mayWrite(seen, into)) {
        return reply.code(403).send({ error: READ_ONLY });
      }
      // Never across a workspace's edge (T343's review).
      if (
        into !== folderIdOf(stored.body) &&
        (await crossesWorkspace(folderIdOf(stored.body), into))
      )
        return reply.code(409).send(ACROSS_WORKSPACE);
      const making = new Set(
        (Array.isArray(payload?.charts)
          ? (payload.charts as { id?: unknown; version?: unknown }[])
          : []
        )
          .filter((chart) => chart.version === 0 && typeof chart.id === 'string')
          .map((chart) => chart.id as string),
      );
      if (!(await addsOnlyOpenable(seen, stored.body, dashboard.body, into, making))) {
        return reply.code(403).send({ error: 'This dashboard can show only charts you may open.' });
      }
      // And only images they may see (T408's review).
      if (!(await addsOnlyReadableImages(seen, stored.body, dashboard.body)))
        return reply.code(403).send(IMAGES_REFUSED);
    }
    /** Library charts' folders, as stored: saving one changes it everywhere it is used. */
    const libraryFolders: (string | null)[] = [];
    /** Each stored chart's body, as read, for the target it keeps (T345's review). */
    const storedCharts = new Map<string, Record<string, unknown>>();

    const charts = payload.charts as { id?: unknown; body?: unknown; version?: unknown }[];
    for (const chart of charts) {
      if (
        typeof chart.id !== 'string' ||
        typeof chart.body !== 'object' ||
        chart.body === null ||
        typeof chart.version !== 'number'
      ) {
        throw new BadRequest('Each chart needs an id, a body and the version it was read at');
      }
    }
    const checked = charts as { id: string; body: Record<string, unknown>; version: number }[];

    for (const chart of checked) {
      /**
       * A library chart this save makes (T133, AC-127) — its own chart saved
       * to a folder — names the folder it is in: one in none would be listed
       * nowhere (T133's review).
       */
      if (
        chart.body['localToDashboardId'] === undefined &&
        typeof chart.body['folderId'] !== 'string'
      )
        throw new BadRequest('A chart saved to a folder names the folder.');
      /**
       * A chart made on this dashboard (T132, AC-126): not yet stored, so at
       * version 0, and created with the dashboard — as its local chart, or,
       * saved to a folder before the dashboard's first save (T133), as a
       * library chart in it. One whose id is already stored is refused inside
       * the transaction.
       */
      if (chart.version === 0) {
        const local = chart.body['localToDashboardId'];
        if (local !== undefined && local !== dashboardId)
          throw new BadRequest('A chart made on a dashboard is local to that dashboard.');
        continue;
      }
      let stored;
      try {
        stored = await docs.get('chart', chart.id);
      } catch (failure) {
        // As the document GET answers it: a stored chart this build cannot
        // read is a known condition with a reason, not a server fault.
        if (failure instanceof ChartDocumentError) {
          return reply.code(422).send({ error: failure.message });
        }
        throw failure;
      }
      // One they may not open answers as one that isn't there, before its
      // version or where it belongs can say otherwise (T326's review).
      if (
        stored === null ||
        (found.seen !== undefined && !(await mayOpen(found.seen, 'chart', stored)))
      )
        return reply.code(404).send({ message: `No such chart: ${chart.id}` });
      /**
       * At the version the client read, or not at all. Where the chart
       * belongs is judged from this read, which is sound only for that
       * version: at any other, it may have become a library chart since.
       */
      if (stored.version !== chart.version) {
        return reply.code(409).send({
          message:
            `This chart changed since you opened it: you are saving over version ` +
            `${String(chart.version)}, and it is now at version ${String(stored.version)}.`,
          document: { kind: 'chart', id: chart.id },
        });
      }
      storedCharts.set(chart.id, stored.body);
      const owner = stored.body['localToDashboardId'];
      /**
       * A library chart edited from a tile is saved everywhere it is used,
       * after the editor has said it is shared and offered a local copy
       * (T134, AC-128; the user's decision, 2026-09-22). It stays a library
       * chart: making it this dashboard's own would take it from the others —
       * a local copy is a new chart.
       */
      if (owner === undefined) {
        if (chart.body['localToDashboardId'] !== undefined)
          throw new BadRequest(
            'A shared chart stays shared: make a local copy of it for this dashboard instead.',
          );
        libraryFolders.push(folderIdOf(stored.body));
        continue;
      }
      if (owner !== dashboardId) {
        throw new BadRequest(
          'This chart belongs to another dashboard, and can only be saved with that one.',
        );
      }
      // Kept local to this dashboard, or saved to a folder as a library chart
      // (T133, AC-127, with the dashboard's Save at the user's decision) —
      // never moved to another dashboard.
      const sent = chart.body['localToDashboardId'];
      if (sent !== undefined && sent !== dashboardId) {
        throw new BadRequest('A dashboard save cannot move a chart to another dashboard.');
      }
    }

    // A library chart saved with the dashboard, or a chart saved to a folder,
    // changes that folder too: theirs to change, where it is and where it goes.
    if (found.seen !== undefined) {
      const seen = found.seen;
      const into = checked
        .filter((chart) => chart.body['localToDashboardId'] === undefined)
        .map((chart) => folderIdOf(chart.body));
      if (![...into, ...libraryFolders].every((folder) => mayWrite(seen, folder))) {
        return reply.code(403).send({ error: READ_ONLY });
      }
      // A chart saved with it, made or moved, stays on its side of the
      // workspace's edge: none reaches a shared folder but by a proposal
      // (T502's review, AC-278).
      // (One left where it is, a shared library chart, is refused below as shared.)
      const dashboardHome = folderIdOf(dashboard.body as Record<string, unknown>);
      for (const chart of checked) {
        if (chart.body['localToDashboardId'] !== undefined) continue;
        const to = folderIdOf(chart.body);
        const was = storedCharts.get(chart.id);
        if (was !== undefined && was['localToDashboardId'] === undefined && folderIdOf(was) === to)
          continue;
        if (await crossesWorkspace(dashboardHome, to))
          return reply.code(409).send(ACROSS_WORKSPACE);
      }
      // A shared dashboard, and a shared folder's library chart even from a
      // workspace dashboard that shows it, change only as copies (T502,
      // AC-278). Asked after what they may not do at all, which says more.
      if (found.stored !== null && (await isShared('dashboard', found.stored)))
        return reply.code(409).send(sharedInPlace('dashboard'));
      for (const folder of libraryFolders)
        if ((await workspaceRootOf(folder)) === null)
          return reply.code(409).send(sharedInPlace('chart'));
    }

    // Published into their folders: each cube a chart names bound in its own
    // (a local chart's, its dashboard's), and each the dashboard's filters
    // name in the dashboard's (T429, AC-272).
    const dashboardFolder = folderIdOf(dashboard.body as Record<string, unknown>);
    /**
     * Each keeps the shared folder it is to go to as stored (T345, AC-282). A
     * library chart this save makes in the workspace goes where its dashboard
     * goes: it can only be made from one of the workspace's own (T343's
     * review), and would otherwise be a workspace item with no target (T345's
     * review).
     */
    const storedDashboard =
      found.stored?.body ?? (await docs.get('dashboard', dashboardId))?.body ?? null;
    // Never a second dashboard of its name in its folder (T336, AC-270).
    const taken = await dashboardNamed(
      dashboardFolder,
      (dashboard.body as Record<string, unknown>)['title'],
      dashboardId,
      storedDashboard === null
        ? undefined
        : { folderId: folderIdOf(storedDashboard), title: storedDashboard['title'] },
    );
    if (taken !== undefined) return reply.code(409).send(taken);
    // Each library chart it shows from off its path, as its own copy, made in
    // the same write (T527, AC-371): one saved with it, as it is sent.
    const withTarget = withStoredTarget(dashboard.body as Record<string, unknown>, storedDashboard);
    const copies = await copiesOnUse(
      { id: dashboardId, body: withTarget },
      chartIdsOf(withTarget),
      new Map(checked.map((chart) => [chart.id, chart.body])),
    );
    const shownBody =
      copies.size === 0
        ? withTarget
        : (withChartsRenamed(withTarget, renamesOf(copies)) as Record<string, unknown>);
    const writing = [
      ...checked,
      ...[...copies.values()].map((copy) => ({ id: copy.id, body: copy.body, version: 0 })),
    ];
    const madeHere = async (chart: { body: Record<string, unknown> }) =>
      chart.body['localToDashboardId'] === undefined &&
      found.seen !== undefined &&
      (await workspaceRootOf(folderIdOf(chart.body) ?? '')) !== null
        ? storedDashboard
        : undefined;
    const boundCharts: Record<string, unknown>[] = [];
    for (const chart of writing) {
      const body = withStoredTarget(
        chart.body,
        chart.version === 0 ? await madeHere(chart) : storedCharts.get(chart.id),
      );
      const bound = await boundIn(
        'chart',
        body['localToDashboardId'] === undefined ? folderIdOf(body) : dashboardFolder,
        body,
      );
      if (bound.kind !== 'ok') return bindingRefused(reply, 'chart', bound);
      boundCharts.push(bound.body);
    }
    const boundDashboard = await boundIn('dashboard', dashboardFolder, shownBody);
    if (boundDashboard.kind !== 'ok') return bindingRefused(reply, 'dashboard', boundDashboard);

    try {
      const written = await docs.updateTogether([
        ...writing.map((chart, index) => ({
          kind: 'chart' as const,
          id: chart.id,
          body: boundCharts[index]!,
          expectedVersion: chart.version,
        })),
        {
          kind: 'dashboard' as const,
          id: dashboardId,
          body: boundDashboard.body,
          expectedVersion: dashboard.version,
        },
      ]);

      // Returned in the order given: the charts, then the dashboard.
      return {
        version: written[writing.length]?.version,
        charts: Object.fromEntries(
          writing.map((chart, index) => [chart.id, written[index]?.version]),
        ),
        ...(copies.size === 0 ? {} : { copied: copiedOf(copies) }),
      };
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'StaleDocumentError') {
        const { kind, id } = failure as Error & { kind?: unknown; id?: unknown };
        return reply.code(409).send({ message: failure.message, document: { kind, id } });
      }
      if (failure instanceof Error && failure.name === 'DocumentNotFoundError') {
        return reply.code(404).send({ message: failure.message });
      }
      if (failure instanceof Error && failure.name === 'DuplicateWriteError') {
        throw new BadRequest(failure.message);
      }
      /**
       * Two overlapping saves can deadlock, and Postgres aborts one with
       * 40P01 (docs/research/db-access.md). Answered as a conflict, not a
       * server fault: the survivor wrote at least one document this save
       * also touches, so a retry would find it stale. **A default, not a
       * decision** — retry-versus-conflict is listed as open for the user in
       * the research doc. Every `updateTogether` locks in (kind, id) order, so
       * no two writers here should form a cycle to begin with.
       */
      if ((failure as { code?: unknown }).code === '40P01') {
        return reply
          .code(409)
          .send({ message: 'Someone else saved part of this dashboard at the same moment.' });
      }
      throw failure;
    }
  });

  app.patch('/api/documents/:kind/:id', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const body = request.body as { title?: string; folderId?: string } | undefined;

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.relocate) throw new BadRequest('Persistence is not configured');

    const title = body?.title?.trim();
    if (title !== undefined && title === '') throw new BadRequest('A title cannot be blank');

    // With security on, one they may change, moved only where they may write
    // too (T326, AC-266).
    const found = await itemFor(request, reply, kind, id, 'write');
    if (found === undefined) return reply;
    if (
      found.seen !== undefined &&
      body?.folderId !== undefined &&
      !(kind === 'folder'
        ? mayMoveFolder(
            found.seen,
            id,
            found.stored === null ? null : folderIdOf(found.stored.body),
            body.folderId,
          )
        : mayWrite(found.seen, body.folderId))
    ) {
      return reply.code(403).send({ error: READ_ONLY });
    }
    // Never across a workspace's edge (T343's review).
    if (body?.folderId !== undefined && found.stored !== null) {
      const from =
        kind === 'folder'
          ? folderIdOf(found.stored.body)
          : await governingFolder(kind, found.stored);
      if (from !== body.folderId && (await crossesWorkspace(from, body.folderId)))
        return reply.code(409).send(ACROSS_WORKSPACE);
    }

    // Renamed or moved, never to a second of its name in a folder (T336, AC-270).
    if (kind === 'dashboard' && (title !== undefined || body?.folderId !== undefined)) {
      const stored = found.stored ?? (await docs.get?.(kind, id)) ?? null;
      if (stored !== null) {
        const taken = await dashboardNamed(
          body?.folderId ?? folderIdOf(stored.body),
          title ?? stored.body['title'],
          id,
          { folderId: folderIdOf(stored.body), title: stored.body['title'] },
        );
        if (taken !== undefined) return reply.code(409).send(taken);
      }
    }

    // A folder holding models or data sources moved into My workspace would
    // leave xcube's tree, and them with it (T428's review, AC-275).
    if (kind === 'folder' && body?.folderId !== undefined) {
      const refusal = await intoWorkspaceRefusal(id, body.folderId);
      if (refusal !== undefined) return reply.status(409).send(refusal);
    }

    // Moved into a folder, a chart or a dashboard is published there: each
    // cube it names bound on its new path, and a dashboard's own charts with
    // it (T429's review, AC-272). Written together where any binding changes.
    if (kind !== 'folder' && body?.folderId !== undefined && docs.get && docs.updateTogether) {
      const stored = await docs.get(kind, id);
      if (stored !== null && folderIdOf(stored.body) !== body.folderId) {
        const moved = {
          ...stored.body,
          folderId: body.folderId,
          ...(title === undefined ? {} : { title }),
        };
        const self = await boundIn(kind, body.folderId, moved);
        if (self.kind !== 'ok') return bindingRefused(reply, kind, self);
        const writes: {
          kind: 'chart';
          id: string;
          body: Record<string, unknown>;
          expectedVersion: number;
        }[] = [];
        if (kind === 'dashboard') {
          const own = ((await cat?.referenceDocuments?.()) ?? []).filter(
            (each) => each.kind === 'chart' && each.localToDashboardId === id,
          );
          for (const { id: chartId } of own) {
            const chart = await docs.get('chart', chartId);
            if (chart === null) continue;
            const bound = await boundIn('chart', body.folderId, chart.body);
            if (bound.kind !== 'ok') return bindingRefused(reply, 'chart', bound);
            if (JSON.stringify(bound.body) !== JSON.stringify(chart.body))
              writes.push({
                kind: 'chart',
                id: chartId,
                body: bound.body,
                expectedVersion: chart.version ?? 0,
              });
          }
        }
        if (writes.length > 0 || JSON.stringify(self.body) !== JSON.stringify(moved)) {
          const written = await docs.updateTogether([
            ...writes,
            { kind, id, body: self.body, expectedVersion: stored.version ?? 0 },
          ]);
          return written.at(-1);
        }
      }
    }

    return docs.relocate({
      kind,
      id,
      ...(title === undefined ? {} : { title }),
      ...(body?.folderId === undefined ? {} : { folderId: body.folderId }),
    });
  });

  /** The dashboards that use a library chart (AC-022). */
  app.get('/api/charts/:chartId/dashboards', USER, async (request) => {
    const { chartId } = request.params as { chartId: string };
    const using = (cat?.dashboardsUsing ? await cat.dashboardsUsing(chartId) : []) as {
      folderId: string | null;
    }[];
    // With security on, only the dashboards they may see (T326, AC-264).
    const seen = await visibilityOf(request);
    if (seen === undefined) return using;
    return using.filter(
      (dashboard) => dashboard.folderId !== null && seen.rights.has(dashboard.folderId),
    );
  });

  /**
   * A shared dashboard's own chart, part of it: it goes only as its dashboard
   * changes, by a proposal (T502's review, AC-278). Known with sign-in on.
   */
  const ownOfShared = async (
    kind: string,
    found: { stored: Stored | null; seen: Visibility | undefined },
  ) =>
    kind === 'chart' &&
    found.seen !== undefined &&
    found.stored !== null &&
    typeof found.stored.body['localToDashboardId'] === 'string' &&
    (await isShared('chart', found.stored));

  /**
   * What keeps a chart from being deleted (T517, AC-362): the dashboards in
   * shared folders that show it, named where the user sees their folder and
   * counted where not (AC-322). A draft in a workspace doesn't hold it back:
   * its tile finds the chart gone. A dashboard's own chart is asked the same,
   * so it isn't taken off its dashboard's tile unawares, as AC-023 kept it.
   */
  const chartDependents = async (
    request: FastifyRequest,
    id: string,
  ): Promise<{
    dashboards: {
      id: string;
      title: string;
      folderId: string | null;
      folderPath: { id: string; title: string }[];
    }[];
    hidden: number;
  }> => {
    if (!cat?.dashboardsUsing) return { dashboards: [], hidden: 0 };
    const using = (await cat.dashboardsUsing(id)) as {
      id: string;
      title: string;
      folderId: string | null;
    }[];
    if (using.length === 0) return { dashboards: [], hidden: 0 };
    // Where each folder is: in a workspace, at any depth, or shared (T343).
    const parents = new Map(
      ((await cat.folders({ counted: false })) as { id: string; parentId: string | null }[]).map(
        (folder) => [folder.id, folder.parentId],
      ),
    );
    const inAWorkspace = (folderId: string | null) => {
      const passed = new Set<string>();
      for (let at = folderId; at != null && !passed.has(at); at = parents.get(at) ?? null) {
        if (isWorkspaceId(at)) return true;
        passed.add(at);
      }
      return false;
    };
    const shared = using.filter((dashboard) => !inAWorkspace(dashboard.folderId));
    const seen = await visibilityOf(request);
    const named = shared.filter(
      (dashboard) =>
        seen === undefined || (dashboard.folderId !== null && seen.rights.has(dashboard.folderId)),
    );
    const pathOf = await folderPathsOf();
    return {
      dashboards: named.map((dashboard) => ({
        id: dashboard.id,
        title: dashboard.title,
        folderId: dashboard.folderId,
        folderPath: dashboard.folderId === null ? [] : pathOf(dashboard.folderId),
      })),
      hidden: shared.length - named.length,
    };
  };

  /**
   * What a delete would be refused for, asked before its dialog opens
   * (T517; design 14, A1): the same answer as its own `409`, to the same
   * users, so what the dialog says is what the delete checks.
   */
  app.get('/api/documents/:kind/:id/dependents', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    if (kind !== 'chart') throw new BadRequest('Only a chart’s dependents are asked here');
    const found = await itemFor(request, reply, kind, id, 'write');
    if (found === undefined) return reply;
    if (await ownOfShared(kind, found)) return reply.code(409).send(sharedInPlace('dashboard'));
    // With security off nothing was read: one that isn't there is said so, as
    // its delete says it; one this build can't read (AC-181) still goes.
    if (found.stored === null && docs?.get !== undefined) {
      const stored = await docs.get('chart', id).catch((failure: unknown) => {
        if (failure instanceof ChartDocumentError) return undefined;
        throw failure;
      });
      if (stored === null) return reply.code(404).send(NOT_THERE);
    }
    return chartDependents(request, id);
  });

  /**
   * Deleting a folder, dashboard or chart. A library chart a shared folder's
   * dashboard shows is refused, naming the dashboards (T517, AC-362; AC-023's
   * confirm-then-delete is retired). The check is on the server, not only in
   * the dialog, so calling the API directly can't skip it. `409` rather than
   * `400`: nothing about the request is malformed, it conflicts with the
   * current state.
   */
  app.delete('/api/documents/:kind/:id', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.remove) throw new BadRequest('Persistence is not configured');

    // With security on, only one they may change (T326, AC-266).
    const found = await itemFor(request, reply, kind, id, 'write');
    if (found === undefined) return reply;
    // A folder goes from the folder holding it, which must be theirs to write
    // in too (AC-291, T329's review).
    if (
      kind === 'folder' &&
      found.seen !== undefined &&
      found.stored !== null &&
      !mayWrite(found.seen, folderIdOf(found.stored.body))
    ) {
      return reply.code(403).send({ error: READ_ONLY });
    }
    if (kind === 'chart' && (await ownOfShared(kind, found)))
      return reply.code(409).send(sharedInPlace('dashboard'));

    if (kind === 'chart') {
      const { dashboards, hidden } = await chartDependents(request, id);
      const using = dashboards.length + hidden;
      if (using > 0)
        return reply.status(409).send({
          error: `This chart is used by ${String(using)} dashboard${using === 1 ? '' : 's'}: remove it from ${using === 1 ? 'it' : 'them'} first.`,
          dashboards,
          hidden,
        });
    }

    /**
     * Only an empty folder is deleted (T521, AC-366): one holding a subfolder,
     * a dashboard, a library chart, a model or a data source is refused,
     * saying what it holds. What it held was left in no folder, seen by no
     * one; its models' cubes left xcube with nothing checked against what
     * uses them (T428's review, AC-275), and its data sources their sealed
     * secrets (T335's review). A read-write member sees the whole folder, so
     * nothing it holds is hidden from them.
     */
    if (kind === 'folder') {
      const holds = await holdingsOf(id);
      const said = holdingsText(holds);
      if (said !== '')
        return reply.status(409).send({
          error: `This folder holds ${said}: only an empty folder can be deleted.`,
          holds,
        });
    }

    // A dashboard's own charts are part of it, and go with it (T518, AC-363).
    const own = kind === 'dashboard' && docs.localTo ? await docs.localTo(id) : [];
    const removed = await docs.remove(kind, id);
    if (removed && kind === 'dashboard') {
      for (const chart of own) await docs.remove('chart', chart.id);
      // Its bookmarks are of it too (T127's review).
      await bookmarks?.removeFor(id);
    }
    return reply.status(removed ? 204 : 404).send();
  });

  /** Add a library chart to another dashboard (AC-022). */
  app.post('/api/dashboards/:dashboardId/charts', USER, async (request, reply) => {
    const { dashboardId } = request.params as { dashboardId: string };
    const body = request.body as { chartId?: string } | undefined;

    if (!body?.chartId) throw new BadRequest('A chartId is required');
    if (!docs?.attachChart) throw new BadRequest('Persistence is not configured');

    // With security on, a dashboard they may change, and a chart they may open
    // (T326, AC-266).
    const board = await itemFor(request, reply, 'dashboard', dashboardId, 'write');
    if (board === undefined) return reply;
    const chart = await itemFor(request, reply, 'chart', body.chartId, 'open');
    if (chart === undefined) return reply;
    // A dashboard's own chart is part of it, and goes when it goes (T518's
    // review, AC-363): shown on another, it would leave that one's tile empty.
    const local = (chart.stored ?? (await docs.get?.('chart', body.chartId)))?.body[
      'localToDashboardId'
    ];
    if (typeof local === 'string')
      throw new BadRequest(
        'This chart is its dashboard’s own: save it to folders to show it on another.',
      );
    // A chart in a workspace stays on that workspace's dashboards (T343's review).
    if (
      board.stored !== null &&
      chart.stored !== null &&
      !(await staysInItsWorkspace(chart.stored, folderIdOf(board.stored.body)))
    )
      return reply.code(409).send({
        error:
          'This chart is in your workspace: it goes on a shared dashboard through a proposal, not in place.',
      });
    // Any chart: a shared dashboard gains a tile only through a proposal
    // (T502, AC-278).
    if (
      board.seen !== undefined &&
      board.stored !== null &&
      (await isShared('dashboard', board.stored))
    )
      return reply.code(409).send(sharedInPlace('dashboard'));

    // One kept off the path of the folder it lands in goes on it as its own
    // copy (T527, AC-371).
    const copy =
      board.stored === null
        ? undefined
        : (await copiesOnUse(board.stored, [body.chartId])).get(body.chartId);
    if (copy !== undefined) {
      // Never the off-path chart itself, for want of a way to make its copy (T527's review).
      if (docs.create === undefined) throw new BadRequest('Persistence is not configured');
      // Bound where it is now governed, as a save binds its copies.
      const bound = await boundIn(
        'chart',
        await governingFolder('chart', { id: copy.id, body: copy.body }),
        copy.body,
      );
      if (bound.kind !== 'ok') return bindingRefused(reply, 'chart', bound);
      await docs.create({ kind: 'chart', id: copy.id, body: bound.body });
      try {
        await docs.attachChart(dashboardId, copy.id);
      } catch (failure) {
        await docs.remove?.('chart', copy.id);
        throw failure;
      }
      return reply.status(201).send({ copied: copiedOf(new Map([[copy.from, copy]])) });
    }

    await docs.attachChart(dashboardId, body.chartId);
    return reply.status(204).send();
  });

  // Title search over dashboards and library charts (AC-019).
  /**
   * An image for a dashboard's image tile (AC-063): stored only if it is a
   * PNG, JPEG, WebP, GIF or SVG — judged by its first bytes, not only its
   * declared type — of at most 2 MB (`imageProblem`, the rule the browser
   * applies too). Sent as base64 inside JSON, the body this API already
   * parses; the route's own `bodyLimit` makes room for 2 MB so encoded
   * (docs/research/api-framework.md), and the size itself is checked here.
   */
  app.post(
    '/api/dashboards/:dashboardId/images',
    { ...USER, bodyLimit: 3 * 1024 * 1024 },
    async (request, reply) => {
      const { dashboardId } = request.params as { dashboardId: string };
      const body = request.body as { contentType?: unknown; data?: unknown } | null;
      if (typeof body?.contentType !== 'string' || typeof body.data !== 'string')
        return reply.code(400).send({ error: 'Send the image as { contentType, data }.' });
      if (images === undefined)
        return reply.code(503).send({ error: 'Images cannot be stored here.' });
      // With security on, onto a dashboard they may change (T326's review).
      if ((await itemFor(request, reply, 'dashboard', dashboardId, 'write')) === undefined)
        return reply;
      const bytes = Buffer.from(body.data, 'base64');
      const problem = imageProblem(
        body.contentType,
        bytes.length,
        bytes.subarray(0, IMAGE_HEAD_BYTES),
      );
      if (problem !== undefined) return reply.code(422).send({ error: problem });
      const id = randomUUID();
      await images.add({ id, dashboardId, contentType: body.contentType, bytes });
      return reply.code(201).send({ id, contentType: body.contentType, size: bytes.length });
    },
  );

  /**
   * An image tile's image, as the type it was accepted as. `nosniff` keeps a
   * browser from reading it as anything else, and the policy keeps an SVG
   * opened on its own from running script or loading anything: an `<img>`
   * never runs an SVG's script, but the image's own address could be opened
   * directly.
   */
  app.get('/api/images/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = await images?.get(id);
    if (image === undefined || !(await mayShowImage(request, id)))
      return reply.code(404).send({ error: 'No such image.' });
    return reply
      .header('content-type', image.contentType)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(image.bytes);
  });

  /**
   * A dashboard's bookmarks (T127, AC-121): the page tab, the filters' values
   * and the marks, under a name. Beside the dashboard, never in it (AC-122).
   * The state is the browser's to check as it applies it, as a URL is; here
   * only that it is one.
   */
  app.get('/api/dashboards/:dashboardId/bookmarks', USER, async (request, reply) => {
    const { dashboardId } = request.params as { dashboardId: string };
    if (bookmarks === undefined)
      return reply.code(503).send({ error: 'Bookmarks cannot be kept here.' });
    // With security on, a dashboard they may open (T326, AC-266).
    if ((await itemFor(request, reply, 'dashboard', dashboardId, 'open')) === undefined)
      return reply;
    // Theirs alone (T366, AC-292).
    return { bookmarks: await bookmarks.list(dashboardId, userOf(request).key) };
  });

  app.post('/api/dashboards/:dashboardId/bookmarks', USER, async (request, reply) => {
    const { dashboardId } = request.params as { dashboardId: string };
    const body = request.body as { name?: unknown; state?: unknown } | undefined;
    if (bookmarks === undefined)
      return reply.code(503).send({ error: 'Bookmarks cannot be kept here.' });
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name === '') return reply.code(400).send({ error: 'A bookmark needs a name.' });
    const state = body?.state;
    const record = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    if (!record(state) || !record(state['filters']) || !record(state['marks']))
      return reply
        .code(400)
        .send({ error: 'A bookmark holds a page tab, filter values and marks.' });
    // With security on, a dashboard they may open: bookmarking changes nothing
    // of it (T326, AC-266). Asked first, so a missing one and a hidden one
    // answer alike (T326's review).
    if ((await itemFor(request, reply, 'dashboard', dashboardId, 'open')) === undefined)
      return reply;
    if (docs?.get !== undefined && (await docs.get('dashboard', dashboardId)) === null)
      return reply.code(404).send({ error: 'No such dashboard.' });
    return reply
      .code(201)
      .send(await bookmarks.save({ dashboardId, name, state, owner: userOf(request).key }));
  });

  app.get('/api/search', USER, async (request) => {
    const { q, limit, kind } = request.query as { q?: string; limit?: string; kind?: string };
    // One kind alone, where a list is of it (T241): charts sorting first must
    // not crowd a dashboard out of the limit.
    if (kind !== undefined && kind !== 'dashboard' && kind !== 'chart')
      throw new BadRequest('kind is dashboard or chart.');
    /**
     * The palette takes the catalog's default; the Explore search box asks
     * for more, because AC-019 lists *every* match there. Still bounded: a
     * search is a query, and five thousand rows is past what a list is for.
     */
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit))
      throw new BadRequest('limit is a whole number.');
    const most = limit === undefined ? undefined : Number(limit);
    if (most !== undefined && most > 5000) throw new BadRequest('limit is at most 5,000.');
    if (!cat) return [];
    // Nothing to look for: no need to read the tree.
    if ((q ?? '').trim() === '') return [];
    // With security on, only what the user may see (T325, AC-264).
    const seen = await visibilityOf(request);
    return cat.search(q ?? '', most, kind, seen === undefined ? undefined : searchable(seen));
  });

  /**
   * Query records name users' filter values (R42.6, T371): with sign-in on,
   * a Super-Admin sees everyone's, a read-write member their own, and no one
   * else any.
   */
  const queryLogScope = async (request: FastifyRequest): Promise<'all' | 'none' | string> => {
    if (security === 'off' || userOf(request).superAdmin) return 'all';
    const scope = await jobsAccess.scope(request);
    if (scope.all) return 'all';
    return scope.writesAny ? userOf(request).key : 'none';
  };

  app.get('/api/jobs/queries', USER, async (request, reply) => {
    const whose = await queryLogScope(request);
    if (whose === 'none') return reply.status(403).send(NO_JOBS);
    const { limit } = request.query as { limit?: string };
    return log ? log.recent(Number(limit) || 100, whose === 'all' ? undefined : whose) : [];
  });

  /**
   * A page of the log, narrowed and sorted over all of it (T240, AC-230): the
   * database does it, so "Failed" finds a failure however many queries came
   * after it, and the count is the log's rather than a window's.
   */
  app.get('/api/jobs/queries/page', USER, async (request, reply) => {
    const whose = await queryLogScope(request);
    if (whose === 'none') return reply.status(403).send(NO_JOBS);
    const q = request.query as Record<string, string | undefined>;
    const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
      const value = q[key];
      if (value === undefined) return undefined;
      if (!(allowed as readonly string[]).includes(value))
        throw new BadRequest(`${key} is one of ${allowed.join(', ')}.`);
      return value as T;
    };
    const whole = (key: string, fallback: number, least: number, most: number): number => {
      const value = q[key];
      if (value === undefined) return fallback;
      if (!/^\d+$/.test(value) || Number(value) < least || Number(value) > most)
        throw new BadRequest(`${key} is a whole number from ${String(least)} to ${String(most)}.`);
      return Number(value);
    };

    const outcome = oneOf('outcome', ['succeeded', 'failed'] as const);
    const source = oneOf('source', ['live', 'accelerated'] as const);
    const within = oneOf('within', ['hour', 'day', 'week'] as const);
    const ask = {
      ...(outcome === undefined ? {} : { outcome }),
      ...(source === undefined ? {} : { source }),
      ...(within === undefined ? {} : { withinSeconds: WITHIN_SECONDS[within] }),
      sort: oneOf('sort', ['when', 'duration'] as const) ?? 'when',
      descending: (oneOf('order', ['asc', 'desc'] as const) ?? 'desc') === 'desc',
      offset: whole('offset', 0, 0, Number.MAX_SAFE_INTEGER),
      // A page is what the Jobs workspace shows; a hundred is past any page.
      limit: whole('limit', 25, 1, 100),
    };
    return log?.page
      ? log.page({ ...ask, ...(whose === 'all' ? {} : { userKey: whose }) })
      : { records: [], total: 0 };
  });

  /**
   * The query records of the request ids a page sent (T180, AC-174): its own
   * queries' timings, whatever else was logged since. A body, not a query
   * string: a dashboard opened many times sends hundreds of ids.
   */
  app.post('/api/jobs/queries/find', USER, async (request) => {
    const requestIds = (request.body as { requestIds?: unknown } | undefined)?.requestIds;
    if (
      !Array.isArray(requestIds) ||
      requestIds.length > 5000 ||
      requestIds.some((id) => typeof id !== 'string')
    )
      throw new BadRequest('requestIds is a list of request ids.');
    // Their own alone, as their Jobs lists them; a Super-Admin's, everyone's
    // (T408, AC-268; R42.6).
    const whose =
      security === 'off' || userOf(request).superAdmin ? undefined : userOf(request).key;
    return log?.byRequestIds ? log.byRequestIds(requestIds as string[], whose) : [];
  });

  /**
   * Cube's message reaches the browser so a tile can show it (AC-012), but the
   * reply is built here rather than by passing the error through, so nothing
   * from the service's own environment can ride along with it (AC-007).
   */
  app.setErrorHandler((error, request, reply) => {
    /**
     * A body past its route's `bodyLimit`: Fastify's own
     * `FST_ERR_CTP_BODY_TOO_LARGE` (docs/research/api-framework.md, which
     * finds no documented status for it — so this one is wechart's). Only the
     * image upload raises its limit, and only an image so large would reach it.
     */
    if ((error as { code?: unknown }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        error: request.url.endsWith('/images')
          ? 'Images can be at most 2 MB.'
          : 'The request is too large.',
      });
    }

    if (error instanceof CubeError) {
      // Logged with its cause: a bad address or certificate reads as Cube away too (T422).
      if (error instanceof CubeUnreachable) app.log.warn({ err: error.cause }, error.message);
      return reply.status(error.status >= 400 && error.status < 600 ? error.status : 502).send({
        error: error.message,
        source: 'cube',
      });
    }

    if (error instanceof BadRequest) {
      return reply.status(400).send({ error: error.message });
    }

    // Nobody signed in (AC-251): no content, whatever the route.
    if (error instanceof Unauthenticated) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }

    // Signed in, and not allowed this (T322).
    if (error instanceof Forbidden) {
      return reply.status(403).send({ error: error.message });
    }

    app.log.error(error);
    return reply.status(500).send({ error: 'Internal error' });
  });

  return app;
}

/**
 * Cube reports `usedPreAggregations` with no entries for a source-database
 * query, so its presence proves nothing: only a non-empty set means the result
 * was accelerated (AC-013, AC-016).
 */
function accelerationOf(result: unknown): {
  accelerated: boolean;
  preAggregation: string | null;
} {
  const used =
    typeof result === 'object' && result !== null && 'usedPreAggregations' in result
      ? ((result as { usedPreAggregations?: Record<string, unknown> }).usedPreAggregations ?? {})
      : {};

  const name = Object.keys(used)[0];
  return { accelerated: name !== undefined, preAggregation: name ?? null };
}

class BadRequest extends Error {
  constructor(message = 'A query is required') {
    super(message);
    this.name = 'BadRequest';
  }
}

export { BadRequest };
