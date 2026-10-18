import { isSuperAdmin } from '@wechart/core';
import type { FastifyInstance } from 'fastify';

import { TOKEN_PREFIX } from '../mcp/tokenText';

/**
 * Who a request is for (phase 2, T311). Every handler reads the user from
 * here and from nowhere else, so single-user mode and signed-in mode differ
 * only in how this is filled (research/openid-client.md, "Security off").
 */
export interface WechartUser {
  /** Stable across sign-ins: what owns a workspace, a bookmark, an audit record. */
  readonly key: string;
  /** What the top bar shows. */
  readonly name: string;
  /** The email or username the provider sent, under the name in the account menu; none with security off. */
  readonly identity?: string;
  /** The AD groups the provider's token carried, exactly as it carried them. */
  readonly groups: readonly string[];
  readonly superAdmin: boolean;
}

/** An Authorization header bearing a personal access token (`mcp/tokenText.ts`'s prefix). */
const PAT_BEARER = new RegExp(`^bearer\\s+${TOKEN_PREFIX}`, 'i');

/** `off` is phase 1's single-user mode; `oidc` signs every user in (AC-251, AC-254). */
export type SecurityMode = 'off' | 'oidc';

/**
 * With security off, wechart runs as one user holding every permission, as a
 * Super-Admin does (AC-254). Phase 1 called that user `admin`, and every
 * document it created names that owner.
 */
export const SINGLE_USER: WechartUser = Object.freeze({
  key: 'admin',
  name: 'admin',
  groups: Object.freeze([]) as readonly string[],
  superAdmin: true,
});

declare module 'fastify' {
  interface FastifyRequest {
    /** Null only while security is on and nobody has signed in. */
    wechartUser: WechartUser | null;
  }
}

/** A request that needs a user and has none: answered 401 (AC-251). */
export class Unauthenticated extends Error {
  constructor() {
    super('unauthenticated');
    this.name = 'Unauthenticated';
  }
}

/** A signed-in user asking for what their role doesn't allow: answered 403. */
export class Forbidden extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Forbidden';
  }
}

/**
 * The request's user, or 401. Handlers take the user through this and never
 * fall back to anyone: with security on, nobody signed in is nobody, not the
 * single user (T311's review).
 */
export function userOf(request: { wechartUser: WechartUser | null }): WechartUser {
  if (request.wechartUser === null) throw new Unauthenticated();
  return request.wechartUser;
}

/**
 * Gives every request its user, before any route sees it. With security on it
 * is read in `preParsing`, which runs after every `onRequest` hook, the
 * session plugin's included (research/openid-client.md, Gotcha 13). A
 * Super-Admin is a member of the group the configuration names, and nobody
 * where it names none (T323, AC-256).
 */
export function registerUser(
  app: FastifyInstance,
  security: SecurityMode,
  superAdminGroup?: string,
): void {
  app.decorateRequest('wechartUser', null);
  // A personal access token is taken on `/mcp` alone, in either mode (T776,
  // AC-435): anywhere else, a request bearing one is answered 401 before
  // anything else is read, whatever cookie it also carries. Told by its
  // prefix, so the install Job's own Bearer token is untouched.
  app.addHook('onRequest', async (request, reply) => {
    const authorization = request.headers.authorization;
    if (
      authorization !== undefined &&
      PAT_BEARER.test(authorization) &&
      request.routeOptions.url !== '/mcp'
    )
      await reply.code(401).send({ error: 'A personal access token is taken on /mcp alone.' });
  });
  if (security === 'off') {
    app.addHook('onRequest', async (request) => {
      request.wechartUser = SINGLE_USER;
    });
    return;
  }
  app.addHook('preParsing', async (request) => {
    const user = (request as { session?: { user?: Omit<WechartUser, 'superAdmin'> } }).session
      ?.user;
    request.wechartUser =
      user === undefined
        ? null
        : {
            key: user.key,
            name: user.name,
            ...(user.identity === undefined ? {} : { identity: user.identity }),
            groups: [...user.groups],
            superAdmin: isSuperAdmin(user.groups, superAdminGroup),
          };
  });
}
