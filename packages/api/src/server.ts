import { randomUUID } from 'node:crypto';

import {
  ChartDocumentError,
  folderRights,
  IMAGE_HEAD_BYTES,
  imageProblem,
  newDashboardBody,
  objectsOf,
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
import { registerIntrospection } from './model/introspection';
import type { Config } from './config';
import type { Changeset } from './xcube/changesets';
import type { XcubeAdmin } from './xcube/client';
import type { PublishedFolders } from './xcube/folders';
import type { PublicationStore } from './xcube/publications';
import { registerModelPublishing } from './model/publish';
import { referencesOf, type ReferenceDocument } from './model/references';
import { searchable, visibleCounts, type Visibility } from './access/visible';
import type { BookmarkStore } from './repos/bookmarks';
import { MY_WORKSPACE_ID, ROOT_FOLDER_ID } from './repos/catalog';
import type { FolderAccessStore } from './repos/folder-access';
import { registerFolderAccess } from './routes/access';
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
   * What xcube last acknowledged of each model (T419), read for the revision
   * every token to Cube names and the field list follows (T421, AC-334).
   */
  readonly publications?: PublicationStore;
  /** Signed-in sessions, with security on (T316): the metadata database. */
  readonly sessions?: SessionStore;
  /** Each folder's AD groups (T314, AC-259, AC-260). */
  readonly folderAccess?: FolderAccessStore;
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
  get(id: string): Promise<{ contentType: string; bytes: Buffer } | undefined>;
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
  /** Each folder's own dashboards and library charts, for counts of what a user may see (T325). */
  libraryCounts?(): Promise<ReadonlyMap<string, { dashboards: number; charts: number }>>;
  dashboardsUsing?(chartId: string): Promise<unknown[]>;
  /** Every chart and dashboard, with its body: what uses a member (T147). */
  referenceDocuments?(): Promise<readonly ReferenceDocument[]>;
}

/** The slice of the query-log repository the server uses. */
export interface QueryLogWriter {
  record(entry: QueryLogEntry): Promise<unknown>;
  recent(limit?: number): Promise<unknown[]>;
  /** The records of these request ids (T180). */
  byRequestIds?(requestIds: readonly string[]): Promise<unknown[]>;
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
  publications,
  folderAccess,
  healthFetch,
  logger = false,
  introspectionRetryMs,
  sessions,
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
   */
  if (afterFolderChange !== undefined)
    app.addHook('onResponse', async (request, reply) => {
      // A write only: not a read, a HEAD included (T449's review).
      if (reply.statusCode >= 300 || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
        return;
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
  if (security === 'oidc') registerSignIn(app, signInOptionsOf(config, sessions));
  registerUser(app, security, config.superAdminGroup);
  registerGuard(app, security, config.publicUrl);

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
  const cubeFor = (request: FastifyRequest): CubeClient =>
    security === 'oidc' ? client.as({ groups: userOf(request).groups }) : client;
  // And metadata per set of groups: access policies hide members per group.
  const metaByGroups = new MetaCachesByGroups(
    (groups) => new MetaCache({ fetchMeta: () => client.as({ groups }).meta(), ...metaOptions }),
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
    return context;
  };

  /** Recording must never be what breaks a chart that loaded fine. */
  const record = async (entry: QueryLogEntry) => {
    try {
      await log?.record(entry);
    } catch (error) {
      app.log.warn({ err: error }, 'could not record query');
    }
  };

  app.get('/api/health', PUBLIC, () => ({ status: 'ok' }));

  app.get('/api/meta', USER, async (request) => metaFor(request).meta());

  /**
   * Who is signed in (AC-190, AC-252, AC-254): the name the top bar shows,
   * whether they are a Super-Admin, and the security mode, so the top bar can
   * show "Single-user mode" in place of Sign out.
   */
  app.get('/api/me', USER, async (request) => {
    const user = userOf(request);
    return {
      name: user.name,
      ...(user.identity === undefined ? {} : { identity: user.identity }),
      groups: user.groups,
      superAdmin: user.superAdmin,
      security,
    };
  });

  /**
   * The Cube API scopes wechart's own context has (T176, AC-170), each probed
   * with its token by the cheapest request past the scope's assertion
   * (`cube/scopes.ts`; research/cube/api-scope-probes.md).
   */
  // Not admin (T323): Jobs' build panel asks it too, for read-write members.
  app.get('/api/cube-scopes', USER, async () => scopesOf((path, init) => client.ask(path, init)));

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
    const { folder } = request.query as { folder?: unknown };
    const folderId = typeof folder === 'string' && folder !== '' ? folder : ROOT_FOLDER_ID;
    const seen = await visibilityOf(request);
    if (seen !== undefined) {
      const right = seen.rights.get(folderId);
      if (right === undefined && folderId !== ROOT_FOLDER_ID)
        return reply.code(404).send({ error: 'There’s no such folder, or it isn’t yours to see.' });
      if (right?.kinds !== 'all') return { files: [] };
    }
    const files = modelFiles ? await modelFiles.list(folderId) : [];
    return {
      files: files.map((file) => ({
        folderId: file.folderId ?? ROOT_FOLDER_ID,
        path: file.path,
        content: file.content,
        ...objectsOf(file.path, file.content),
      })),
    };
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
      return folderId !== ROOT_FOLDER_ID && !seen.rights.has(folderId)
        ? { status: 404, body: { error: 'There’s no such folder, or it isn’t yours to see.' } }
        : { status: 403, body: { error: READ_ONLY } };
    },
    ...(afterPublish === undefined ? {} : { afterPublish }),
    ...(xcube === undefined ? {} : { xcube }),
    ...(folders === undefined ? {} : { folders }),
    ...(beforeFolderPublish === undefined ? {} : { beforeFolderPublish }),
  });
  // With the model's files: each rollup's link names its stored file (T449).
  registerBuilds(app, client, modelFiles);
  // With the model's files: a key's SQL is read there (T273's review).
  registerSchedules(app, client, modelFiles);
  // A data source's catalog, through Cube's introspection API (T145, AC-139).
  registerIntrospection(
    app,
    client,
    introspectionRetryMs === undefined ? {} : { retryMs: introspectionRetryMs },
  );
  // Each folder's AD groups and its effective access (T314, AC-259, AC-260).
  if (folderAccess !== undefined) registerFolderAccess(app, folderAccess);

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
    // With security on, only what the user may see (T326's review): a dashboard
    // in a folder they see, a chart local to one, a library chart where every
    // kind is theirs.
    const seen = await visibilityOf(request);
    if (seen === undefined) return referencesOf(all, members);
    const folderOf = (document: { body: unknown }) =>
      folderIdOf((document.body ?? {}) as Record<string, unknown>);
    const dashboards = new Map(
      all.filter((each) => each.kind === 'dashboard').map((each) => [each.id, each]),
    );
    const visible = all.filter((document) => {
      if (document.kind === 'dashboard') return seen.rights.has(folderOf(document) ?? '');
      if (document.localToDashboardId !== null) {
        const dashboard = dashboards.get(document.localToDashboardId);
        return dashboard !== undefined && seen.rights.has(folderOf(dashboard) ?? '');
      }
      return seen.rights.get(folderOf(document) ?? '')?.kinds === 'all';
    });
    return referencesOf(visible, members);
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
  app.post('/api/load', USER, async (request) => {
    const body = request.body as
      { query?: Record<string, unknown>; cache?: unknown; context?: unknown } | undefined;
    if (!body?.query) throw new BadRequest();
    // Cube's own cache policy, and only its own values: `no-cache` for a
    // tile's "Refresh now" (T154, AC-148).
    const cache = body.cache;
    if (cache !== undefined && !CACHE_POLICIES.includes(cache as CachePolicy))
      throw new BadRequest();
    // A previewed security context (T172, AC-166): its claims, never wechart's.
    const context = previewOf(request, body.context);

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
      });
      return result;
    } catch (error) {
      await record({
        requestId,
        query: body.query,
        durationMs: performance.now() - startedAt,
        accelerated: false,
        error: error instanceof Error ? error.message : String(error),
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
  app.post('/api/acceleration', USER, async (request) => {
    const body = request.body as { query?: Record<string, unknown> } | undefined;
    if (!body?.query) throw new BadRequest();
    const query = body.query;
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
    const body = request.body as { query?: Record<string, unknown>; context?: unknown } | undefined;
    if (!body?.query) throw new BadRequest();
    const context = previewOf(request, body.context);
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
    return {
      tree,
      rights: folderRights(tree, { groups: user.groups, superAdmin: user.superAdmin }),
    };
  };
  /** Each visible folder's count of what the user may see in and beneath it (AC-194). */
  type Stored = { readonly id: string; readonly body: Record<string, unknown> };
  const folderIdOf = (body: Record<string, unknown>): string | null =>
    typeof body['folderId'] === 'string' ? body['folderId'] : null;
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
    const using = (cat?.dashboardsUsing ? await cat.dashboardsUsing(item.id) : []) as {
      folderId: string | null;
    }[];
    return using.some(
      (dashboard) => dashboard.folderId !== null && seen.rights.has(dashboard.folderId),
    );
  };
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
  const addsOnlyOpenable = async (seen: Visibility, before: unknown, after: unknown) => {
    const had = chartIdsOf(before);
    for (const id of chartIdsOf(after)) {
      if (had.has(id)) continue;
      const chart = await docs?.get?.('chart', id);
      if (!chart || !(await mayOpen(seen, 'chart', chart))) return false;
    }
    return true;
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

  /** These visible folders' counts of what the user may see in and beneath them (AC-194). */
  const countsOf = async (seen: Visibility, only: readonly string[]) =>
    visibleCounts(seen, cat?.libraryCounts ? await cat.libraryCounts() : new Map(), only);

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
  // The two roots' counts, which are no folder's (AC-194).
  app.get('/api/folder-roots', USER, async (request) => {
    const seen = await visibilityOf(request);
    if (seen === undefined) return cat?.rootCounts ? cat.rootCounts() : {};
    // My workspace is each user's own, and empty until T343 gives them one.
    return {
      [ROOT_FOLDER_ID]: (await countsOf(seen, [ROOT_FOLDER_ID])).get(ROOT_FOLDER_ID) ?? 0,
      [MY_WORKSPACE_ID]: 0,
    };
  });

  app.get('/api/folders/:folderId/contents', USER, async (request, reply) => {
    const { folderId } = request.params as { folderId: string };
    if (!cat) return [];
    const seen = await visibilityOf(request);
    if (seen === undefined) return cat.contents(folderId);
    if (folderId === MY_WORKSPACE_ID) return [];
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
    // they can't see answers as one that isn't there. The two roots always are;
    // My workspace becomes each user's own with T343.
    const seen = await visibilityOf(request);
    if (seen !== undefined && !mayWrite(seen, folderId)) {
      const isRoot = folderId === ROOT_FOLDER_ID || folderId === MY_WORKSPACE_ID;
      return !isRoot && !seen.rights.has(folderId)
        ? reply.code(404).send(NOT_THERE)
        : reply.code(403).send({ error: READ_ONLY });
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
      body:
        kind === 'dashboard'
          ? { ...newDashboardBody({ title, folderId, owner }) }
          : { title, folderId, owner },
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
      // A dashboard shows only charts they may open (T326's review).
      if (kind === 'dashboard' && !(await addsOnlyOpenable(seen, stored.body, body.body))) {
        return reply.code(403).send({ error: 'This dashboard can show only charts you may open.' });
      }
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
    }

    try {
      return await docs.update({ kind, id, body: written, expectedVersion: body.version });
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
      if (!(await addsOnlyOpenable(seen, stored.body, dashboard.body))) {
        return reply.code(403).send({ error: 'This dashboard can show only charts you may open.' });
      }
    }
    /** Library charts' folders, as stored: saving one changes it everywhere it is used. */
    const libraryFolders: (string | null)[] = [];

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
    }

    try {
      const written = await docs.updateTogether([
        ...checked.map((chart) => ({
          kind: 'chart' as const,
          id: chart.id,
          body: chart.body,
          expectedVersion: chart.version,
        })),
        {
          kind: 'dashboard' as const,
          id: dashboardId,
          body: dashboard.body as Record<string, unknown>,
          expectedVersion: dashboard.version,
        },
      ]);

      // Returned in the order given: the charts, then the dashboard.
      return {
        version: written[checked.length]?.version,
        charts: Object.fromEntries(
          checked.map((chart, index) => [chart.id, written[index]?.version]),
        ),
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
   * AC-023: deleting a library chart that dashboards use names them and
   * requires confirmation.
   *
   * The check is on the server, not only in the dialog: a delete that arrives
   * without confirmation is refused with the list of dashboards, so the naming
   * cannot be skipped by calling the API directly. `409` rather than `400` —
   * nothing about the request is malformed, it conflicts with the current
   * state.
   */
  app.delete('/api/documents/:kind/:id', USER, async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const { confirm } = request.query as { confirm?: string };

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

    if (kind === 'chart' && confirm !== 'true' && cat?.dashboardsUsing) {
      // Named only where they may see them (T326's review).
      const seen = found.seen;
      const dashboards = ((await cat.dashboardsUsing(id)) as { folderId: string | null }[]).filter(
        (dashboard) =>
          seen === undefined ||
          (dashboard.folderId !== null && seen.rights.has(dashboard.folderId)),
      );
      if (dashboards.length > 0) {
        return reply.status(409).send({
          error: 'This chart is used by dashboards. Confirm to delete it.',
          requiresConfirmation: true,
          dashboards,
        });
      }
    }

    const removed = await docs.remove(kind, id);
    // A dashboard's bookmarks are of it, and go with it (T127's review).
    if (removed && kind === 'dashboard') await bookmarks?.removeFor(id);
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
    if ((await itemFor(request, reply, 'dashboard', dashboardId, 'write')) === undefined)
      return reply;
    if ((await itemFor(request, reply, 'chart', body.chartId, 'open')) === undefined) return reply;

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
    if (image === undefined) return reply.code(404).send({ error: 'No such image.' });
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

  app.get('/api/jobs/queries', USER, async (request) => {
    const { limit } = request.query as { limit?: string };
    return log ? log.recent(Number(limit) || 100) : [];
  });

  /**
   * A page of the log, narrowed and sorted over all of it (T240, AC-230): the
   * database does it, so "Failed" finds a failure however many queries came
   * after it, and the count is the log's rather than a window's.
   */
  app.get('/api/jobs/queries/page', USER, async (request) => {
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
    return log?.page ? log.page(ask) : { records: [], total: 0 };
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
    return log?.byRequestIds ? log.byRequestIds(requestIds as string[]) : [];
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
