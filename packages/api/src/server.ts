import { randomUUID } from 'node:crypto';

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
  readonly logger?: boolean;
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
  ): Promise<{ id: string; body: Record<string, unknown> } | null>;
  update?(input: {
    kind: 'folder' | 'dashboard' | 'chart';
    id: string;
    body: Record<string, unknown>;
    expectedVersion: number;
  }): Promise<unknown>;
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

    const created = await docs.create({
      kind,
      id: randomUUID(),
      body: { title, folderId: body?.folderId ?? 'root', owner: 'admin' },
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

    const found = await docs.get(kind, id);
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
  app.setErrorHandler((error, _request, reply) => {
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
