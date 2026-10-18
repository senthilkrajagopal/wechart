import rateLimit, { normalizeIP } from '@fastify/rate-limit';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { bearerAuthChallengeResponse } from '@modelcontextprotocol/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { viaMcp } from '../audit/record';
import { PUBLIC } from '../auth/guard';
import { asUser, Unauthenticated } from '../auth/user';
import type { AuditStore } from '../repos/audit';
import { type McpAuth, noTokens } from './auth';
import { mcpGuard } from './guard';
import {
  MCP_BAD_TOKEN_LIMIT,
  MCP_RATE_LIMIT,
  type RateLimitCounter,
  RateLimited,
  rateLimitStore,
} from './rateLimitStore';
import { mcpHandler, type McpTool } from './server';

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
  /**
   * Where each token's requests are counted (T779, AC-472): the metadata
   * database, shared by every replica. Unset, nothing can be counted, so a
   * request bearing a token is refused with 503 (AC-473).
   */
  readonly rateLimits?: RateLimitCounter;
  /** A token's requests a minute, `WECHART_MCP_RATE_LIMIT`: 60 unset (AC-472). */
  readonly rateLimit?: number;
  /** An address's bad-token requests a minute, `WECHART_MCP_BAD_TOKEN_LIMIT`: 20 unset (AC-474). */
  readonly badTokenLimit?: number;
  /** The tools served (T782 on); none unset. */
  readonly tools?: readonly McpTool[];
  /** Where every tool call is recorded (T781, AC-478). */
  readonly audit?: Pick<AuditStore, 'record'>;
}

const MINUTE_MS = 60_000;
/** The count's keys: a working token's, by its id; a bad or missing one's, by address. */
const TOKEN_KEY = 'tok:';
const ADDRESS_KEY = 'ip:';

declare module 'fastify' {
  interface FastifyRequest {
    /** The caller of `/mcp`, once its token is taken (T776); null everywhere else. */
    mcpAuth: McpAuth | null;
    /** Why `/mcp` took no token, answered 401 once the request is counted (T780). */
    mcpRefusal: { readonly error: unknown } | null;
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
 * AC-436), then takes the token (T776, AC-435), then counts the request
 * (T779, T780), all in `onRequest`, before the body is read. A refused token
 * is then answered as the SDK's `bearerAuthChallengeResponse` builds it: 401
 * with its `WWW-Authenticate: Bearer` challenge.
 */
export function registerMcp(app: FastifyInstance, options: McpOptions): void {
  const guard = mcpGuard(options.host);
  const verifyToken = options.verifyToken ?? noTokens;
  app.decorateRequest('mcpAuth', null);
  app.decorateRequest('mcpRefusal', null);
  // The token taken, or why not, without answering yet: the limiter counts
  // a bad or missing token by address first (T780, AC-474;
  // `fastify-rate-limit.md`, "Order relative to the auth hook").
  const tokenCheck = async (request: FastifyRequest) => {
    try {
      request.mcpAuth = await verifyToken(request.headers.authorization);
    } catch (error) {
      request.mcpRefusal = { error };
    }
  };
  // Then, once counted, a refused token is answered 401 (T776, AC-435).
  const refuseUntaken = async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (request.mcpAuth !== null) return payload;
    const refusal = bearerAuthChallengeResponse(request.mcpRefusal?.error);
    reply.status(refusal.status);
    refusal.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    return reply.send(await refusal.text());
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
  const handler = mcpHandler((error) => app.log.error({ err: error }, 'MCP'), {
    tools: options.tools ?? [],
    ...(options.audit === undefined ? {} : { audit: options.audit }),
    log: app.log,
    // A tool reads through the web app's own routes, as its caller (T782).
    ask: (user, url) =>
      asUser(user, async (headers) => {
        const answer = await app.inject({ method: 'GET', url, headers });
        const json = () => {
          try {
            return answer.json<unknown>();
          } catch {
            return null;
          }
        };
        return { status: answer.statusCode, body: json() };
      }),
  });
  const node = toNodeHandler(handler, { onerror: (error) => app.log.error({ err: error }, 'MCP') });
  app.addHook('onClose', async () => {
    await handler.close();
  });
  // "GET and DELETE should be answered with 405" (same source).
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    reply.status(405).header('allow', 'POST').send({ error: 'MCP is spoken here by POST alone.' });
  // Its own scope, so the limiter's `onRoute` hook sees `/mcp`'s routes alone
  // (`fastify-rate-limit.md`, "Scoping to `/mcp` only").
  app.register(async (mcp) => {
    // Every request counted in the metadata database, whatever its method:
    // one bearing a working token under the token alone (T779, AC-472),
    // keyed by its id, never its text (Gotcha 13); one bearing a bad or
    // missing token under its address, an IPv6 address by its /64, as the
    // plugin's own key does (T780, AC-474; Gotchas 5 and 9). So a flood of
    // bad tokens from a shared egress never throttles the working tokens
    // behind it (`mcp-deployment-and-tokens.md`, "A shared egress means two
    // budgets"). The limiter is a route-level `onRequest` hook, so it runs
    // after the Host, Origin and token checks. A count that fails is
    // rethrown (`skipOnError` off): 503, fail closed (AC-473). The error
    // handler answers both (`server.ts`).
    const tokenLimit = options.rateLimit ?? MCP_RATE_LIMIT;
    const addressLimit = options.badTokenLimit ?? MCP_BAD_TOKEN_LIMIT;
    await mcp.register(rateLimit, {
      hook: 'onRequest',
      max: (_request, key) => (key.startsWith(TOKEN_KEY) ? tokenLimit : addressLimit),
      timeWindow: MINUTE_MS,
      store: rateLimitStore(options.rateLimits),
      skipOnError: false,
      keyGenerator: (request) =>
        request.mcpAuth === null
          ? `${ADDRESS_KEY}${normalizeIP(request.ip, 64)}`
          : `${TOKEN_KEY}${request.mcpAuth.clientId}`,
      errorResponseBuilder: (_request, context) => new RateLimited(context.after),
    });
    mcp.post(
      MCP_PATH,
      {
        ...PUBLIC,
        onRequest: [...guard, tokenCheck],
        preParsing: [refuseUntaken, actAsCaller],
      },
      async (request, reply) => {
        // Never without a token: `refuseUntaken` answered that.
        const auth = request.mcpAuth;
        if (auth === null) throw new Unauthenticated();
        reply.hijack();
        // `auth` on the raw request is where the adapter reads it from (the SDK's Fastify recipe).
        const raw = Object.assign(request.raw, { auth }) as Parameters<typeof node>[0];
        // Served as the token's request: whatever it records says so (T781, AC-442).
        const { id, name } = auth.extra.token;
        await viaMcp({ id, name }, () => node(raw, reply.raw, request.body));
      },
    );
    // Counted as a POST is, by its token or its address (T780), then 405
    // whatever the token: each its own hook array, which the limiter pushes into.
    mcp.get(MCP_PATH, { ...PUBLIC, onRequest: [...guard, tokenCheck] }, notAllowed);
    mcp.delete(MCP_PATH, { ...PUBLIC, onRequest: [...guard, tokenCheck] }, notAllowed);
  });
}
