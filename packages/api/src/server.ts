import Fastify, { type FastifyInstance } from 'fastify';

import { CubeClient, CubeError } from './cube/client';
import type { Config } from './config';

/**
 * The wechart API. The browser talks only to this, and this is the only thing
 * that talks to Cube (AC-007).
 */
export interface BuildOptions {
  readonly config: Config;
  readonly cube?: CubeClient;
  readonly logger?: boolean;
}

export function buildServer({ config, cube, logger = false }: BuildOptions): FastifyInstance {
  const app = Fastify({ logger });
  const client =
    cube ??
    new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: config.cubeApiSecret,
      securityContext: config.securityContext,
    });

  app.get('/api/health', () => ({ status: 'ok' }));

  app.get('/api/meta', async () => client.meta());

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
