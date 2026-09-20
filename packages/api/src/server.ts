import Fastify, { type FastifyInstance } from 'fastify';

import { CubeClient, CubeError } from './cube/client';
import { MetaCache } from './cube/meta-cache';
import type { Config } from './config';

/**
 * The wechart API. The browser talks only to this, and this is the only thing
 * that talks to Cube (AC-007).
 */
export interface BuildOptions {
  readonly config: Config;
  readonly cube?: CubeClient;
  readonly metaCache?: MetaCache;
  readonly logger?: boolean;
}

export function buildServer({
  config,
  cube,
  metaCache,
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

  app.post('/api/load', async (request) => {
    const body = request.body as { query?: Record<string, unknown> } | undefined;
    if (!body?.query) throw new BadRequest();
    return client.load(body.query);
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

class BadRequest extends Error {
  constructor(message = 'A query is required') {
    super(message);
    this.name = 'BadRequest';
  }
}
