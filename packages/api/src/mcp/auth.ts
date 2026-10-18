import {
  type AuthInfo,
  OAuthError,
  OAuthErrorCode,
  type OAuthTokenVerifier,
  verifyBearerToken,
} from '@modelcontextprotocol/server';

import type { AccessTokenStore, PresentedToken } from '../repos/access-tokens';
import { digestOf, wellFormed } from './tokenText';

/** One answer for every token that doesn't work, so none tells an unknown token from a stopped one. */
const REFUSED = 'The token is unknown, revoked or expired.';

/** What `/mcp` knows of its caller once the token is taken: the token, its owner and scopes. */
export interface McpAuth extends AuthInfo {
  readonly extra: { readonly token: PresentedToken };
}

/**
 * The SDK's token verifier over wechart's personal access tokens (T776,
 * AC-435, AC-431): a token of the wrong shape is refused without the
 * database; otherwise its digest finds a working token, neither revoked
 * nor past its expiry, or it is refused. `expiresAt` is set, in seconds, as
 * the SDK's bearer check needs (`mcp-typescript-sdk.md`, Gotcha 7).
 */
export function tokenVerifier(store: AccessTokenStore, now: () => Date): OAuthTokenVerifier {
  return {
    async verifyAccessToken(text: string): Promise<AuthInfo> {
      if (!wellFormed(text)) throw new OAuthError(OAuthErrorCode.InvalidToken, REFUSED);
      const token = await store.presented(digestOf(text), now());
      if (token === undefined) throw new OAuthError(OAuthErrorCode.InvalidToken, REFUSED);
      return {
        token: text,
        clientId: token.id,
        scopes: [...token.scopes],
        expiresAt: Math.floor(token.expiresAt.getTime() / 1000),
        extra: { token },
      };
    },
  };
}

/**
 * Takes the token from the `Authorization: Bearer` header alone (AC-435):
 * none there, whatever the query string or a session cookie holds, is no
 * token. A token taken is recorded as used now (AC-430). A refusal throws
 * the SDK's `OAuthError`, which `bearerAuthChallengeResponse` answers 401
 * with its `WWW-Authenticate: Bearer` challenge.
 */
export function bearerAuth(store: AccessTokenStore, now: () => Date) {
  const verifier = tokenVerifier(store, now);
  return async (authorization: string | undefined): Promise<McpAuth> => {
    const auth = (await verifyBearerToken(authorization, { verifier })) as McpAuth;
    await store.used(auth.extra.token.id, now());
    return auth;
  };
}

/** Turns away every token, with the same challenges: `/mcp` where no token store is given. */
export async function noTokens(authorization: string | undefined): Promise<never> {
  await verifyBearerToken(authorization, {
    verifier: {
      async verifyAccessToken() {
        throw new OAuthError(OAuthErrorCode.InvalidToken, REFUSED);
      },
    },
  });
  throw new OAuthError(OAuthErrorCode.InvalidToken, REFUSED);
}
