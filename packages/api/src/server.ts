import { randomUUID } from 'node:crypto';

import {
  ChartDocumentError,
  IMAGE_HEAD_BYTES,
  imageProblem,
  newDashboardBody,
} from '@wechart/core';
import Fastify, { type FastifyInstance } from 'fastify';

import { CubeClient, CubeError } from './cube/client';
import { MetaCache } from './cube/meta-cache';
import type { Config } from './config';
import type { QueryLogEntry } from './repos/query-log';

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
  readonly logger?: boolean;
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
  folders(): Promise<unknown[]>;
  contents(folderId: string): Promise<unknown[]>;
  search(text: string): Promise<unknown[]>;
  dashboardsUsing?(chartId: string): Promise<unknown[]>;
}

/** The slice of the query-log repository the server uses. */
export interface QueryLogWriter {
  record(entry: QueryLogEntry): Promise<unknown>;
  recent(limit?: number): Promise<unknown[]>;
}

export function buildServer({
  config,
  cube,
  metaCache,
  queryLog: log,
  catalog: cat,
  documents: docs,
  images,
  logger = false,
}: BuildOptions): FastifyInstance {
  const app = Fastify({ logger });
  const client =
    cube ??
    new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: config.cubeApiSecret,
      securityContext: config.securityContext,
    });

  // Metadata is cached with a 60-second freshness bound (AC-009), so a
  // dashboard opening many tiles issues one /v1/meta request, not one per tile.
  const meta = metaCache ?? new MetaCache({ fetchMeta: () => client.meta() });

  /** Recording must never be what breaks a chart that loaded fine. */
  const record = async (entry: QueryLogEntry) => {
    try {
      await log?.record(entry);
    } catch (error) {
      app.log.warn({ err: error }, 'could not record query');
    }
  };

  app.get('/api/health', () => ({ status: 'ok' }));

  app.get('/api/meta', async () => meta.meta());

  /**
   * AC-011: a superseded query is stopped in Cube, not merely ignored in the
   * browser. Always answers 204: the tile that issued it is already gone, and
   * a failure to cancel is not something anyone can act on.
   */
  app.delete('/api/running-query/:requestId', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      await client.cancel(requestId);
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
  app.post('/api/load', async (request) => {
    const body = request.body as { query?: Record<string, unknown> } | undefined;
    if (!body?.query) throw new BadRequest();

    const requestId = String(request.headers['x-request-id'] ?? 'unknown');
    const startedAt = performance.now();

    try {
      const result = await client.load(body.query);
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

  // Explore's folder tree and contents (AC-017).
  app.get('/api/folders', async () => (cat ? cat.folders() : []));

  app.get('/api/folders/:folderId/contents', async (request) => {
    const { folderId } = request.params as { folderId: string };
    return cat ? cat.contents(folderId) : [];
  });

  /**
   * Create a folder, dashboard or chart in a folder (AC-020). The id is minted
   * here rather than accepted from the browser, so a client cannot choose to
   * overwrite an existing object by claiming its id.
   */
  app.post('/api/documents', async (request, reply) => {
    const body = request.body as { kind?: string; title?: string; folderId?: string } | undefined;

    const kind = body?.kind;
    const title = body?.title?.trim();

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!title) throw new BadRequest('A title is required');
    if (!docs) throw new BadRequest('Persistence is not configured');

    const folderId = body?.folderId ?? 'root';
    const owner = 'admin';

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
  app.get('/api/documents/:kind/:id', async (request, reply) => {
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
    if (found === null) return reply.code(404).send({ message: 'No such document' });
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
  app.put('/api/documents/:kind/:id', async (request, reply) => {
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

    try {
      return await docs.update({ kind, id, body: body.body, expectedVersion: body.version });
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
   * **Only charts local to this dashboard.** A library chart can be on other
   * dashboards, and AC-128 requires the editor to say so and offer a local
   * copy *before* changes spread (T134); a chart local to another dashboard is
   * that dashboard's to save. The browser holds Save back for both
   * (`whyUnsaveable`, the same rule); this route refuses them too, so no
   * *dashboard save* can spread a change. It is not the only way to write a
   * chart: `PUT /api/documents/:kind/:id` writes any chart, library or not —
   * the library chart's own save — and AC-128's warning there is T134's too.
   *
   * Locality is read before the transaction, and only at the version the
   * client read (409 otherwise). Any later change to the chart, including
   * making it a library chart, moves its version, and the version-checked
   * write inside the transaction then refuses it.
   */
  app.put('/api/dashboards/:id', async (request, reply) => {
    const { id: dashboardId } = request.params as { id: string };
    const payload = request.body as { dashboard?: unknown; charts?: unknown } | undefined;

    if (!docs?.updateTogether || !docs.get) throw new BadRequest('Persistence is not configured');

    const dashboard = payload?.dashboard as { body?: unknown; version?: unknown } | undefined;
    if (
      typeof dashboard !== 'object' ||
      dashboard === null ||
      typeof dashboard.body !== 'object' ||
      dashboard.body === null ||
      typeof dashboard.version !== 'number'
    ) {
      throw new BadRequest('A dashboard body and the version it was read at are required');
    }
    if (!Array.isArray(payload?.charts)) throw new BadRequest('charts must be a list');

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
      if (stored === null) return reply.code(404).send({ message: `No such chart: ${chart.id}` });
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
      if (owner === undefined) {
        throw new BadRequest(
          'A library chart cannot be saved with a dashboard yet: other dashboards can use it too, and they would change without warning.',
        );
      }
      if (owner !== dashboardId) {
        throw new BadRequest(
          'This chart belongs to another dashboard, and can only be saved with that one.',
        );
      }
      if (chart.body['localToDashboardId'] !== dashboardId) {
        throw new BadRequest('A dashboard save cannot move a chart to another dashboard.');
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

  app.patch('/api/documents/:kind/:id', async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const body = request.body as { title?: string; folderId?: string } | undefined;

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.relocate) throw new BadRequest('Persistence is not configured');

    const title = body?.title?.trim();
    if (title !== undefined && title === '') throw new BadRequest('A title cannot be blank');

    return docs.relocate({
      kind,
      id,
      ...(title === undefined ? {} : { title }),
      ...(body?.folderId === undefined ? {} : { folderId: body.folderId }),
    });
  });

  /** The dashboards that use a library chart (AC-022). */
  app.get('/api/charts/:chartId/dashboards', async (request) => {
    const { chartId } = request.params as { chartId: string };
    return cat?.dashboardsUsing ? cat.dashboardsUsing(chartId) : [];
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
  app.delete('/api/documents/:kind/:id', async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const { confirm } = request.query as { confirm?: string };

    if (kind !== 'folder' && kind !== 'dashboard' && kind !== 'chart') {
      throw new BadRequest('kind must be one of folder, dashboard or chart');
    }
    if (!docs?.remove) throw new BadRequest('Persistence is not configured');

    if (kind === 'chart' && confirm !== 'true' && cat?.dashboardsUsing) {
      const dashboards = await cat.dashboardsUsing(id);
      if (dashboards.length > 0) {
        return reply.status(409).send({
          error: 'This chart is used by dashboards. Confirm to delete it.',
          requiresConfirmation: true,
          dashboards,
        });
      }
    }

    const removed = await docs.remove(kind, id);
    return reply.status(removed ? 204 : 404).send();
  });

  /** Add a library chart to another dashboard (AC-022). */
  app.post('/api/dashboards/:dashboardId/charts', async (request, reply) => {
    const { dashboardId } = request.params as { dashboardId: string };
    const body = request.body as { chartId?: string } | undefined;

    if (!body?.chartId) throw new BadRequest('A chartId is required');
    if (!docs?.attachChart) throw new BadRequest('Persistence is not configured');

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
    { bodyLimit: 3 * 1024 * 1024 },
    async (request, reply) => {
      const { dashboardId } = request.params as { dashboardId: string };
      const body = request.body as { contentType?: unknown; data?: unknown } | null;
      if (typeof body?.contentType !== 'string' || typeof body.data !== 'string')
        return reply.code(400).send({ error: 'Send the image as { contentType, data }.' });
      if (images === undefined)
        return reply.code(503).send({ error: 'Images cannot be stored here.' });
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
  app.get('/api/images/:id', async (request, reply) => {
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

  app.get('/api/search', async (request) => {
    const { q } = request.query as { q?: string };
    return cat ? cat.search(q ?? '') : [];
  });

  app.get('/api/jobs/queries', async (request) => {
    const { limit } = request.query as { limit?: string };
    return log ? log.recent(Number(limit) || 100) : [];
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
      return reply.status(error.status >= 400 && error.status < 600 ? error.status : 502).send({
        error: error.message,
        source: 'cube',
      });
    }

    if (error instanceof BadRequest) {
      return reply.status(400).send({ error: error.message });
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
