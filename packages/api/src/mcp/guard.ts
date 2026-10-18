import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/fastify';
import type { onRequestHookHandler } from 'fastify';

/**
 * The checks `/mcp` makes before anything else, its token included (T775,
 * AC-436): the `Host` must be the MCP host, and an `Origin`, where one is
 * sent, must be that host's too. Either failing answers 403.
 *
 * Both are the SDK's Fastify hooks, which compare hostnames alone, ports
 * left out (`@modelcontextprotocol/fastify` 2.0.1; `mcp-typescript-sdk.md`,
 * "Mounting in the existing Fastify app" and Gotcha 4). A request with no
 * `Origin` passes, as non-browser clients such as Claude Code send none
 * (the spec's rule applies only when it is present). The only Origin
 * allowed is the MCP host's own: no wechart page calls `/mcp`, and the
 * deployment names no other (the lane's call, overturnable).
 */
export function mcpGuard(host: string): onRequestHookHandler[] {
  return [hostHeaderValidation([host]), originValidation([host])] as onRequestHookHandler[];
}
