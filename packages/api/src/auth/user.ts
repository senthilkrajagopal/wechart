import type { FastifyInstance } from 'fastify';

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
  /** The AD groups the provider's token carried, exactly as it carried them. */
  readonly groups: readonly string[];
  readonly superAdmin: boolean;
}

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

/**
 * The request's user, or 401. Handlers take the user through this and never
 * fall back to anyone: with security on, nobody signed in is nobody, not the
 * single user (T311's review).
 */
export function userOf(request: { wechartUser: WechartUser | null }): WechartUser {
  if (request.wechartUser === null) throw new Unauthenticated();
  return request.wechartUser;
}

/** Gives every request its user, before any route sees it. */
export function registerUser(app: FastifyInstance, security: SecurityMode): void {
  app.decorateRequest('wechartUser', null);
  app.addHook('onRequest', async (request) => {
    request.wechartUser = security === 'off' ? SINGLE_USER : null;
  });
}
