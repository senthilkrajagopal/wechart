import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

/**
 * Signing a test user in through the development provider (Dex, started by
 * the api tests' global setup), for tests that need a signed-in session
 * (T316, T317). The API redirects to Dex, this fills in Dex's form as a
 * browser would, and hands Dex's redirect back to the API's callback.
 */
export interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly groups: readonly string[];
}

export const USERS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../infra/dex/test-users.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, TestUser>;

/** The public address the tests' servers are configured with. */
export const PUBLIC_URL = 'http://localhost:5373';

/** The `name=value` of a response's session cookie. */
export function cookieOf(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (first === undefined) throw new Error('the response set no session cookie');
  return first.split(';')[0]!;
}

/** Follows Dex from its authorization URL through its login form; returns wechart's callback URL. */
export async function signInAtDex(authorizeUrl: string, user: TestUser): Promise<string> {
  let url = authorizeUrl;
  // Dex, with one connector, redirects /auth to that connector's login page.
  for (let hops = 0; hops < 5; hops += 1) {
    const response = await fetch(url, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      url = new URL(response.headers.get('location')!, url).href;
      continue;
    }
    const html = await response.text();
    const action = /<form[^>]*method="post"[^>]*action="([^"]+)"/i.exec(html)?.[1];
    if (action === undefined) throw new Error(`Dex showed no login form at ${url}`);
    const post = await fetch(new URL(action.replace(/&amp;/g, '&'), url), {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ login: user.email, password: user.password }),
    });
    let next = new URL(post.headers.get('location')!, url).href;
    // Through Dex's approval step (skipped by its config) to wechart's callback.
    for (let more = 0; more < 5 && !next.startsWith(PUBLIC_URL); more += 1) {
      const step = await fetch(next, { redirect: 'manual' });
      next = new URL(step.headers.get('location')!, next).href;
    }
    return next;
  }
  throw new Error('Dex never showed its login form');
}

/** Signs `user` in to `app`, returning the signed-in session's cookie. */
export async function signIn(app: FastifyInstance, user: TestUser): Promise<string> {
  const login = await app.inject({ method: 'GET', url: '/api/auth/login?returnTo=/explore' });
  const authorize = login.headers.location;
  if (login.statusCode !== 302 || typeof authorize !== 'string') {
    throw new Error(`sign-in didn't redirect to the provider: ${login.statusCode}`);
  }
  if (!authorize.startsWith('http://localhost:5556/dex/auth')) {
    throw new Error(`sign-in redirected somewhere other than Dex: ${authorize}`);
  }

  const callback = new URL(await signInAtDex(authorize, user));
  if (callback.pathname !== '/api/auth/callback') {
    throw new Error(`Dex returned somewhere other than the callback: ${callback.href}`);
  }
  const done = await app.inject({
    method: 'GET',
    url: `${callback.pathname}${callback.search}`,
    headers: { cookie: cookieOf(login.headers['set-cookie']) },
  });
  if (done.statusCode !== 302 || done.headers.location !== '/explore') {
    throw new Error(`the callback didn't sign ${user.email} in: ${done.statusCode} ${done.body}`);
  }
  return cookieOf(done.headers['set-cookie']);
}
