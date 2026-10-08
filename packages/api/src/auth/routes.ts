import { createHash } from 'node:crypto';

import fastifyCookie from '@fastify/cookie';
import fastifySession, { type SessionStore } from '@fastify/session';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';

import { recordIn } from '../audit/record';
import type { Config, OidcSettings } from '../config';
import type { AuditStore } from '../repos/audit';
import { PUBLIC } from './guard';
import { displayNameFrom, groupsFrom, identityFrom, oidcConfig } from './oidc';
import { signedOutPage, signInFailedPage } from './statePages';

/**
 * Signing in, with security on (T316, AC-252, AC-316; research/openid-client.md):
 * the authorization-code flow with PKCE, state and nonce, and the user kept in
 * a server-side session. The browser holds only the signed session id.
 */

/** A sign-in lasts 12 hours, whatever the activity (the user's R24, AC-316). */
export const SIGNED_IN_MS = 12 * 60 * 60 * 1000;

/** A sign-in started and not finished lapses after this. */
export const PENDING_MS = 15 * 60 * 1000;

/** At most this many sign-ins in flight in one session: an unauthenticated route can't grow a row. */
const MAX_ATTEMPTS = 10;

/** Who the session is for: identity and groups, exactly as the token carried them. */
export interface SessionUser {
  /** The issuer and subject together: the only stable identity (research, OIDC Core §5.7). */
  readonly key: string;
  readonly name: string;
  /** The email or username the provider sent, for the account menu (T319). */
  readonly identity?: string;
  readonly groups: readonly string[];
}

/** One sign-in attempt, keyed by its `state`, so two tabs don't clobber each other. */
interface SignInAttempt {
  readonly verifier: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly at: number;
}

declare module 'fastify' {
  interface Session {
    user?: SessionUser;
    /** For `id_token_hint` at sign-out, where the provider takes one. */
    idToken?: string;
    oidcTx?: Record<string, SignInAttempt>;
    /**
     * Why the last sign-in failed, for its page's Details (design 09, state
     * D; T697), kept here rather than in the page's address, so no link can
     * put words of its own on a wechart page (T697's review).
     */
    signInFailure?: { readonly detail: string; readonly returnTo: string };
  }
}

/**
 * Only a path on wechart itself (T316's review). The value is read as a URL
 * against the public address, so every trick a browser would undo — a tab or
 * newline, a backslash, two slashes — resolves to another origin and is refused.
 */
export function safeReturnTo(value: unknown, publicUrl: string): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  let target: URL;
  try {
    target = new URL(value, publicUrl);
  } catch {
    return '/';
  }
  if (target.origin !== new URL(publicUrl).origin) return '/';
  return `${target.pathname}${target.search}${target.hash}`;
}

/**
 * The page sign-in returns to, from `/api/auth/login?returnTo=…`. The app
 * sends it encoded; the web server, gating a page (T321), can only send
 * nginx's `$request_uri` as it is, so `/explore?folder=a&panel=access` would
 * lose `panel` to a parameter of its own. Where `returnTo` comes first, the
 * whole rest of the query is its value.
 */
export function returnToOf(url: string): string | undefined {
  const query = url.split('?').slice(1).join('?');
  if (!query.startsWith('returnTo=')) {
    return new URLSearchParams(query).get('returnTo') ?? undefined;
  }
  const rest = query.slice('returnTo='.length);
  // The app's is encoded whole (`%2F…`); nginx's is the address as it came,
  // already percent-encoded, which must not be decoded again (T321's review).
  if (!/^%2F/i.test(rest)) return rest;
  try {
    return decodeURIComponent(rest);
  } catch {
    return undefined;
  }
}

/** A user's key: the subject, qualified by the issuer's hash so two providers can't collide. */
export function userKeyOf(issuer: string, subject: string): string {
  const qualifier = createHash('sha256').update(issuer).digest('hex').slice(0, 12);
  return `${qualifier}:${subject}`;
}

export interface SignInOptions {
  readonly publicUrl: string;
  readonly sessionSecret: string;
  readonly oidc: OidcSettings;
  /** The session store: wechart's metadata database outside tests' fakes. */
  readonly store?: SessionStore;
  /** Where each sign-in is recorded (T368, AC-294). */
  readonly audit?: Pick<AuditStore, 'record'>;
}

export function signInOptionsOf(config: Config, store?: SessionStore): SignInOptions {
  if (
    config.publicUrl === undefined ||
    config.sessionSecret === undefined ||
    config.oidc === undefined
  ) {
    throw new Error('security is on, but sign-in is not configured');
  }
  return {
    publicUrl: config.publicUrl,
    sessionSecret: config.sessionSecret,
    oidc: config.oidc,
    ...(store === undefined ? {} : { store }),
  };
}

/**
 * Where the browser goes once signed out (T317; research/openid-client.md
 * "Logout"): the provider's end-session page when it has one, so it forgets
 * the sign-in too (Entra: "perform both"), and from there back to wechart.
 * Dex has none (research/dex.md), and a provider that can't be reached can't
 * be asked: then straight back to wechart, whose own session has ended anyway.
 */
export function signOutTarget(
  config: oidc.Configuration | undefined,
  publicUrl: string,
  idToken: string | undefined,
): string {
  // wechart's own signed-out page (design 09, state C; T697), never the
  // provider's sign-in form, which a shared machine would sit on pre-filled.
  // The provider registers it as a post-logout redirect (docs/deploy.md).
  const home = new URL(SIGNED_OUT, publicUrl).href;
  if (config?.serverMetadata().end_session_endpoint === undefined) return home;
  return oidc.buildEndSessionUrl(config, {
    post_logout_redirect_uri: home,
    ...(idToken === undefined ? {} : { id_token_hint: idToken }),
  }).href;
}

/**
 * wechart's own pages for the end of a sign-in (design 09, states C and D;
 * T697). State E, no group list, waits on how to tell it from a user in no
 * group: Dex and Keycloak leave the claim out for one (research/dex.md,
 * keycloak.md).
 */
export const SIGNED_OUT = '/signed-out';
export const SIGN_IN_FAILED = '/sign-in-failed';

/**
 * To the sign-in-failed page (state D): never a JSON body in the browser. The
 * reason for its Details and where "Try again" returns to are kept in the
 * session, signed in as nobody, so the page's address carries no words a
 * link could choose (T697's review).
 */
function failedSignIn(
  request: FastifyRequest,
  reply: FastifyReply,
  detail: string,
  returnTo = '/',
): FastifyReply {
  if (request.session.user === undefined) request.session.options({ maxAge: PENDING_MS });
  request.session.signInFailure = { detail: detail.slice(0, 500), returnTo };
  return reply.redirect(SIGN_IN_FAILED);
}

/** The provider couldn't be asked: say so, not "Internal error" (T316's review). */
function unreachable(reply: FastifyReply, error: unknown): FastifyReply {
  reply.log.warn({ err: error }, 'the sign-in provider could not be reached');
  return reply.status(503).send({
    error: 'The sign-in provider can’t be reached. Try again shortly.',
    detail: error instanceof Error ? error.message : String(error),
  });
}

export function registerSignIn(app: FastifyInstance, options: SignInOptions): void {
  const secure = options.publicUrl.startsWith('https:');
  const callbackUrl = new URL('/api/auth/callback', options.publicUrl).href;
  // `__Host-` requires Secure, so a plain-HTTP development origin uses a plain name.
  const cookieName = secure ? '__Host-wechart' : 'wechart';
  const cookie = { path: '/', httpOnly: true, sameSite: 'lax', secure } as const;

  app.register(fastifyCookie);
  app.register(fastifySession, {
    secret: options.sessionSecret,
    cookieName,
    ...(options.store === undefined ? {} : { store: options.store }),
    // Neither default suits: one row per anonymous request, and a write per request.
    saveUninitialized: false,
    rolling: false,
    cookie: { ...cookie, maxAge: SIGNED_IN_MS },
  });

  app.get('/api/auth/login', PUBLIC, async (request, reply) => {
    // Already signed in: straight back, the session untouched. Changing it
    // would save it with a fresh 12 hours, and a sign-in must end 12 hours
    // after it began, whatever the activity (AC-316; T321's review).
    if (request.session.user !== undefined) {
      return reply.redirect(safeReturnTo(returnToOf(request.url), options.publicUrl));
    }
    let config: oidc.Configuration;
    try {
      config = await oidcConfig(options.oidc);
    } catch (error) {
      return unreachable(reply, error);
    }
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const returnTo = safeReturnTo(returnToOf(request.url), options.publicUrl);

    // Unfinished attempts lapse, and only the latest few are kept.
    const now = Date.now();
    const kept = Object.entries(request.session.oidcTx ?? {})
      .filter(([, attempt]) => now - attempt.at < PENDING_MS)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_ATTEMPTS - 1);
    request.session.oidcTx = {
      ...Object.fromEntries(kept),
      [state]: { verifier, nonce, returnTo, at: now },
    };
    // Nobody is signed in yet: the session lives only as long as the attempt.
    if (request.session.user === undefined) request.session.options({ maxAge: PENDING_MS });

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: options.oidc.scopes,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return reply.redirect(url.href);
  });

  /**
   * wechart's own pages for the end of a sign-in (design 09, states C and D; T697),
   * served here, whole, since the web server gives the app's bundle only to
   * the signed-in (AC-251). The web server routes these two paths to the API.
   */
  const html = (reply: FastifyReply, body: string) =>
    reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body);
  app.get(SIGNED_OUT, PUBLIC, async (_request, reply) => html(reply, signedOutPage()));
  app.get(SIGN_IN_FAILED, PUBLIC, async (request, reply) => {
    // The reason this session's sign-in failed; nothing from the address.
    const failure = request.session.signInFailure;
    return html(
      reply,
      signInFailedPage(
        failure?.detail ?? '',
        safeReturnTo(failure?.returnTo ?? '/', options.publicUrl),
      ),
    );
  });

  app.get('/api/auth/callback', PUBLIC, async (request, reply) => {
    // Built from the configured public address, never from the request's Host.
    const current = new URL(request.url, options.publicUrl);
    const state = current.searchParams.get('state') ?? '';
    const attempt = request.session.oidcTx?.[state];
    if (attempt === undefined || Date.now() - attempt.at >= PENDING_MS) {
      return failedSignIn(request, reply, 'This sign-in wasn’t started here.');
    }

    let config: oidc.Configuration;
    try {
      config = await oidcConfig(options.oidc);
    } catch (error) {
      // On the way back, the browser's: wechart's page, never JSON (T697's review).
      request.log.warn({ err: error }, 'the sign-in provider could not be reached');
      return failedSignIn(
        request,
        reply,
        'The sign-in provider can’t be reached. Try again shortly.',
        attempt.returnTo,
      );
    }
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(config, current, {
        pkceCodeVerifier: attempt.verifier,
        expectedState: state,
        expectedNonce: attempt.nonce,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'sign-in failed');
      return failedSignIn(
        request,
        reply,
        error instanceof Error ? error.message : String(error),
        attempt.returnTo,
      );
    }
    const claims = tokens.claims();
    if (claims === undefined) {
      return failedSignIn(request, reply, 'The provider sent no ID token.', attempt.returnTo);
    }

    // Groups from the configured claim: the ID token's, else UserInfo's.
    let groups = groupsFrom(claims, options.oidc.groupsClaim);
    if (!(options.oidc.groupsClaim in claims) && tokens.access_token !== undefined) {
      try {
        const userInfo = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
        groups = groupsFrom(userInfo, options.oidc.groupsClaim);
      } catch (error) {
        request.log.warn({ err: error }, 'the provider’s UserInfo failed');
        return failedSignIn(
          request,
          reply,
          `wechart couldn’t read your groups from the sign-in provider: ${
            error instanceof Error ? error.message : String(error)
          }`,
          attempt.returnTo,
        );
      }
    }

    // A new session id once signed in (session fixation; research, OWASP),
    // lasting 12 hours from now (AC-316).
    await request.session.regenerate();
    request.session.options({ maxAge: SIGNED_IN_MS });
    request.session.user = {
      key: userKeyOf(claims.iss, claims.sub),
      name: displayNameFrom(claims),
      identity: identityFrom(claims),
      groups,
    };
    if (tokens.id_token !== undefined) request.session.idToken = tokens.id_token;
    // In the audit trail (T368, AC-294): who, and when.
    const { key, name, identity } = request.session.user;
    await recordIn(
      options.audit,
      {
        actor: { key, name, ...(identity === undefined ? {} : { identity }) },
        event: 'sign-in',
        folderId: null,
        item: null,
        summary: 'Signed in',
      },
      request.log,
    );
    return reply.redirect(attempt.returnTo);
  });

  /**
   * Signing out (T317, AC-253): the session's row is deleted, so every copy of
   * its cookie stops working at once. A POST, so no link or image another page
   * embeds can sign anyone out; the Sign out control calls it and then goes to
   * `redirectTo`.
   */
  app.post('/api/auth/logout', PUBLIC, async (request, reply) => {
    const signedIn = request.session.user !== undefined;
    const idToken = request.session.idToken;
    await request.session.destroy();
    // After destroy the session plugin sets no cookie, so it is cleared here
    // (research) — only where the request sent one. A cross-site form's POST
    // carries no SameSite=Lax cookie; clearing it anyway would let another
    // site sign the user out (T317's review).
    if (request.cookies[cookieName] !== undefined) reply.clearCookie(cookieName, cookie);
    const home = signOutTarget(undefined, options.publicUrl, undefined);
    if (!signedIn) return { redirectTo: home };

    // The provider's end-session page where there is one; wechart's own
    // session has ended whatever the provider does.
    try {
      const config = await oidcConfig(options.oidc);
      return { redirectTo: signOutTarget(config, options.publicUrl, idToken) };
    } catch (error) {
      request.log.warn({ err: error }, 'signed out here; the provider’s sign-out was not reached');
      return { redirectTo: home };
    }
  });
}
