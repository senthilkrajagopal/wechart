import type { AuthInfo, ScopeChallenge, ScopeChallengeHandler } from '@modelcontextprotocol/server';

import type { TokenScope } from '../repos/access-tokens';

/**
 * A tool's scope, asked before it runs (T785, AC-433, AC-469): a call by a
 * token without the scope its tool needs is answered 403 with
 * `WWW-Authenticate: Bearer error="insufficient_scope", scope="‹scope›"`,
 * by the SDK's per-tool `scopeChallenge`, before any of it runs
 * (`mcp-typescript-sdk.md`, "`McpServer.registerTool`"; how the installed
 * SDK answers it, `mcp-sdk-installed-notes.md` §12). `refused` is told of
 * the call first, so it is recorded as every call is (AC-478).
 */
export function scopeChallenge(
  tool: { readonly name: string; readonly scope: TokenScope },
  refused: (authInfo: AuthInfo) => Promise<void>,
): ScopeChallengeHandler {
  return async ({ authInfo }): Promise<ScopeChallenge | undefined> => {
    // No token: the POST answered 401 before the SDK was reached.
    if (authInfo === undefined || authInfo.scopes.includes(tool.scope)) return undefined;
    await refused(authInfo);
    return {
      scopes: [tool.scope],
      // RFC 6750's error-description grammar: printable ASCII, no quote or backslash.
      errorDescription: `This token wasn't given the ${tool.scope} scope, which ${tool.name} needs.`,
    };
  };
}
