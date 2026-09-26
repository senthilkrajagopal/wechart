import type { FastifyInstance, HTTPMethods } from 'fastify';

import type { SecurityMode } from './user';

/**
 * Who may call each API route (T318, AC-251; tasks.md, Phase 2 decisions):
 *
 * - `public`: health and signing in, which must answer before anyone has;
 * - `user`: everything else, which with security on answers 401 and nothing
 *   more to a request without a signed-in session;
 * - `admin`: a `user` route for Super-Admins alone, which answers anyone else
 *   signed in 403 (T323, AC-256, AC-265): the Security workspace's.
 *
 * Every route declares its class. One that doesn't stops the server starting,
 * so a route added later can't be open by being forgotten. Cube reads nothing
 * from wechart since xcube serves the model, so no class is Cube's (T431,
 * AC-251, AC-327).
 */
export type Access = 'public' | 'user' | 'admin';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Who may call the route (T318). */
    access?: Access;
  }
}

/** The methods that change something (T412, AC-317). */
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** A route's options declaring its class: `app.get(url, USER, handler)`. */
export const PUBLIC = { config: { access: 'public' } } as const;
export const USER = { config: { access: 'user' } } as const;
export const ADMIN = { config: { access: 'admin' } } as const;

export interface RouteAccess {
  readonly method: HTTPMethods;
  readonly url: string;
  readonly access: Access;
}

const ROUTES = new WeakMap<FastifyInstance, RouteAccess[]>();

/** Every route the server has, with its class: what the AC-251 sweep asks. */
export function routesOf(app: FastifyInstance): readonly RouteAccess[] {
  return ROUTES.get(app) ?? [];
}

/**
 * Requires every route to declare its class. Registered before any route, so
 * none escapes it; the routes of plugins registered later are covered too.
 */
export function registerRouteAccess(app: FastifyInstance): void {
  const routes: RouteAccess[] = [];
  ROUTES.set(app, routes);
  app.addHook('onRoute', (route) => {
    const access = route.config?.access;
    const methods = [route.method].flat();
    if (access !== 'public' && access !== 'user' && access !== 'admin') {
      throw new Error(
        `${methods.join(',')} ${route.url} declares no access class (public, user or admin; T318)`,
      );
    }
    for (const method of methods) routes.push({ method, url: route.url, access });
  });
}

/**
 * With security on, before a body is read or a handler runs:
 * - a request from another site that would change something answers 403,
 *   whatever it carries, by its `Sec-Fetch-Site` or an `Origin` that isn't
 *   the public address (T412, AC-317);
 * - a `user` or `admin` route answers 401 `{ error: 'unauthenticated' }` to a
 *   request with no signed-in user;
 * - an `admin` route answers 403 to anyone signed in who isn't a Super-Admin.
 * Registered after `registerUser`, whose `preParsing` hook it follows
 * (research/openid-client.md, "Plugins, the guard and the OIDC routes").
 * Security off registers nothing: the single user is always there.
 */
export function registerGuard(
  app: FastifyInstance,
  security: SecurityMode,
  publicUrl?: string,
): void {
  if (security === 'off') return;
  const ours = publicUrl === undefined ? undefined : new URL(publicUrl).origin;
  app.addHook('preParsing', async (request, reply) => {
    // A request from another site that would change something is refused,
    // whatever cookie it carries: sign-out included (T412, AC-317; the user's
    // R25). A tool that sends neither header is let through to the checks below.
    if (UNSAFE.has(request.method)) {
      const site = request.headers['sec-fetch-site'];
      const origin = request.headers['origin'];
      if (site === 'cross-site' || (origin !== undefined && origin !== ours)) {
        await reply
          .code(403)
          .send({ error: 'A request from another site can’t change anything here.' });
        return;
      }
    }
    const access = request.routeOptions.config.access;
    if (access === 'public') return;
    // Sent and awaited, the reply stops the chain: no body is read and no
    // handler runs (T318's review; Fastify's hook runner checks `reply.sent`).
    if (request.wechartUser === null) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return;
    }
    // An admin route: a Super-Admin's alone (T323).
    if (access === 'admin' && !request.wechartUser.superAdmin) {
      await reply.code(403).send({ error: 'Only a Super-Admin can use this.' });
    }
  });
}
