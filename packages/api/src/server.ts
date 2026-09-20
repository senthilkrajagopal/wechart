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
  readonly logger?: boolean;
}

/** The slice of the catalog repository the server exposes. */
export interface CatalogReader {
  folders(): Promise<unknown[]>;
  contents(folderId: string): Promise<unknown[]>;
  search(text: string): Promise<unknown[]>;
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
