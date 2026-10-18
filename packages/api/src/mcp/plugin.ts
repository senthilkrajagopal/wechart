import { toNodeHandler } from '@modelcontextprotocol/node';
import { bearerAuthChallengeResponse } from '@modelcontextprotocol/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { PUBLIC } from '../auth/guard';
import { type McpAuth, noTokens } from './auth';
import { mcpGuard } from './guard';
import { mcpHandler } from './server';

/** Where MCP is served, on its host (AC-476). */
export const MCP_PATH = '/mcp';

/** The address the token pages give for MCP: its host's, over TLS (AC-476), or none. */
export const mcpUrlOf = (host: string | undefined): string | null =>
  host === undefined ? null : `https://${host}${MCP_PATH}`;

export interface McpOptions {
  /** The MCP host the deployment names (AC-476); the only `Host` and `Origin` let in (AC-436). */
  readonly host: string;
  /**
   * Takes the token from the `Authorization` header (T776, `auth.ts`'s
   * `bearerAuth`), throwing the SDK's `OAuthError` to turn the request
   * away. Unset, no token is taken.
   */
  readonly verifyToken?: (authorization: string | undefined) => Promise<McpAuth>;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The caller of `/mcp`, once its token is taken (T776); null everywhere else. */
    mcpAuth: McpAuth | null;
  }
}

/**
 * The MCP endpoint (T774, AC-476), registered only where the deployment
 * names a host for MCP: with none, the server has no `/mcp` route at all
 * and no MCP code runs (design 18's Q6, "MCP off").
 *
 * Its routes are public to the session guard: a client signs in with its
 * token in the Authorization header alone, never the web app's cookie
 * (design 18, E3). Each route first checks the Host and Origin (T775,
 * AC-436), then, for a POST, the token (T776, AC-435), all in `onRequest`,
 * before the body is read. A refused token is answered as the SDK's
 * `bearerAuthChallengeResponse` builds it: 401 with its
 * `WWW-Authenticate: Bearer` challenge.
 */
export function registerMcp(app: FastifyInstance, options: McpOptions): void {
  const guard = mcpGuard(options.host);
  const verifyToken = options.verifyToken ?? noTokens;
  app.decorateRequest('mcpAuth', null);
  const tokenCheck = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.mcpAuth = await verifyToken(request.headers.authorization);
    } catch (error) {
      const refusal = bearerAuthChallengeResponse(error);
      reply.status(refusal.status);
      refusal.headers.forEach((value, name) => {
        reply.header(name, value);
      });
      return reply.send(await refusal.text());
    }
  };
  // One JSON-RPC request per POST (the 2026-07-28 Streamable HTTP transport,
  // `mcp-typescript-sdk.md`, "Transports and client support").
  // The request acts as the token's caller, the web app's user for every
  // check it makes (T777, AC-432). Set in the route's own `preParsing`,
  // which runs after the session's, so no cookie's user can stand in.
  const actAsCaller = async (request: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
    request.wechartUser = request.mcpAuth?.extra.caller ?? null;
    return payload;
  };
  // MCP itself (T778, AC-434): the SDK's handler, through its Node adapter,
  // given the body Fastify parsed and the caller's `authInfo`. The reply is
  // hijacked, as the handler writes the raw response itself.
  const handler = mcpHandler((error) => app.log.error({ err: error }, 'MCP'));
  const node = toNodeHandler(handler, { onerror: (error) => app.log.error({ err: error }, 'MCP') });
  app.addHook('onClose', async () => {
    await handler.close();
  });
  app.post(
    MCP_PATH,
    { ...PUBLIC, onRequest: [...guard, tokenCheck], preParsing: actAsCaller },
    async (request, reply) => {
      reply.hijack();
      // `auth` on the raw request is where the adapter reads it from (the SDK's Fastify recipe).
      const raw = Object.assign(request.raw, { auth: request.mcpAuth }) as Parameters<
        typeof node
      >[0];
      await node(raw, reply.raw, request.body);
    },
  );
  // "GET and DELETE should be answered with 405" (same source).
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    reply.status(405).header('allow', 'POST').send({ error: 'MCP is spoken here by POST alone.' });
  app.get(MCP_PATH, { ...PUBLIC, onRequest: guard }, notAllowed);
  app.delete(MCP_PATH, { ...PUBLIC, onRequest: guard }, notAllowed);
}
