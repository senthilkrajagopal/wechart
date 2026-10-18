import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { PUBLIC } from '../auth/guard';
import { mcpGuard } from './guard';

/** Where MCP is served, on its host (AC-476). */
export const MCP_PATH = '/mcp';

/** The address the token pages give for MCP: its host's, over TLS (AC-476), or none. */
export const mcpUrlOf = (host: string | undefined): string | null =>
  host === undefined ? null : `https://${host}${MCP_PATH}`;

export interface McpOptions {
  /** The MCP host the deployment names (AC-476); the only `Host` and `Origin` let in (AC-436). */
  readonly host: string;
  /**
   * Reads the `Authorization` header's token; null turns the request away.
   * Until the token check is built (T776), no token is taken.
   */
  readonly verifyToken?: (authorization: string | undefined) => Promise<unknown>;
}

const noToken = async () => null;

/**
 * The MCP endpoint (T774, AC-476), registered only where the deployment
 * names a host for MCP: with none, the server has no `/mcp` route at all
 * and no MCP code runs (design 18's Q6, "MCP off").
 *
 * Its routes are public to the session guard: a client signs in with its
 * token in the Authorization header alone, never the web app's cookie
 * (design 18, E3). Each route first checks the Host and Origin (T775,
 * AC-436), then, for a POST, the token, all in `onRequest`, before the body
 * is read.
 */
export function registerMcp(app: FastifyInstance, options: McpOptions): void {
  const guard = mcpGuard(options.host);
  const verifyToken = options.verifyToken ?? noToken;
  const tokenCheck = async (request: FastifyRequest, reply: FastifyReply) => {
    const caller = await verifyToken(request.headers.authorization);
    if (caller === null)
      return reply
        .status(401)
        .header('www-authenticate', 'Bearer')
        .send({ error: 'A personal access token is needed, in the Authorization header.' });
  };
  // One JSON-RPC request per POST (the 2026-07-28 Streamable HTTP transport,
  // `mcp-typescript-sdk.md`, "Transports and client support").
  app.post(MCP_PATH, { ...PUBLIC, onRequest: [...guard, tokenCheck] }, async (_request, reply) =>
    reply.status(401).header('www-authenticate', 'Bearer').send({ error: 'Nothing is served yet.' }),
  );
  // "GET and DELETE should be answered with 405" (same source).
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    reply.status(405).header('allow', 'POST').send({ error: 'MCP is spoken here by POST alone.' });
  app.get(MCP_PATH, { ...PUBLIC, onRequest: guard }, notAllowed);
  app.delete(MCP_PATH, { ...PUBLIC, onRequest: guard }, notAllowed);
}
