import type { FastifyInstance, FastifyReply } from 'fastify';

import { PUBLIC } from '../auth/guard';

/** Where MCP is served, on its host (AC-476). */
export const MCP_PATH = '/mcp';

/** The address the token pages give for MCP: its host's, over TLS (AC-476), or none. */
export const mcpUrlOf = (host: string | undefined): string | null =>
  host === undefined ? null : `https://${host}${MCP_PATH}`;

/**
 * The MCP endpoint (T774, AC-476), registered only where the deployment
 * names a host for MCP: with none, the server has no `/mcp` route at all
 * and no MCP code runs (design 18's Q6, "MCP off").
 *
 * Its routes are public to the session guard: a client signs in with its
 * token in the Authorization header alone, never the web app's cookie
 * (design 18, E3). Until the token check is built (T776), every POST is
 * answered 401 with `WWW-Authenticate: Bearer`, and nothing runs.
 */
export function registerMcp(app: FastifyInstance): void {
  // One JSON-RPC request per POST (the 2026-07-28 Streamable HTTP transport,
  // `mcp-typescript-sdk.md`, "Transports and client support").
  app.post(MCP_PATH, PUBLIC, async (_request, reply: FastifyReply) =>
    reply
      .status(401)
      .header('www-authenticate', 'Bearer')
      .send({ error: 'A personal access token is needed, in the Authorization header.' }),
  );
  // "GET and DELETE should be answered with 405" (same source).
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    reply.status(405).header('allow', 'POST').send({ error: 'MCP is spoken here by POST alone.' });
  app.get(MCP_PATH, PUBLIC, notAllowed);
  app.delete(MCP_PATH, PUBLIC, notAllowed);
}
