import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { pgSessionStore } from './session-store';
import { signInFailedPage } from './statePages';
import { PUBLIC_URL } from './sign-in.fixture';

/**
 * T697 (design 09, states C and D; AC-251, AC-253, AC-343): wechart's own pages
 * for the end of a sign-in, served by the API itself, whole, with no app
 * bundle, since the web server gives the bundle only to the signed-in
 * (AC-251). The product mark, one sentence, and one action each.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const servers: FastifyInstance[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()));
  await closeDb();
});

function serve(): FastifyInstance {
  const app = buildServer({ config, sessions: pgSessionStore(getDb()) });
  servers.push(app);
  return app;
}

const page = async (url: string) => {
  const response = await serve().inject({ method: 'GET', url });
  expect(response.statusCode, url).toBe(200);
  expect(response.headers['content-type']).toMatch(/^text\/html/);
  return response.body;
};

describe('wechart’s pages for the end of a sign-in (T697; design 09, states C and D)', () => {
  it('C: signed out, with Sign in again, and nothing else of wechart', async () => {
    const html = await page('/signed-out');
    expect(html).toContain('<h1 class="state-card__title">You’ve signed out of wechart.</h1>');
    expect(html).toContain('<a class="btn btn-primary" href="/api/auth/login">Sign in again</a>');
    // No app bundle: nothing of wechart behind it (rule 60).
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  /**
   * D's page as drawn, from the reason the callback kept in the session
   * (routes.test.ts sends a failed callback through it): the provider's words
   * only in Details, as text, and Try again back to where it began.
   */
  it('D: sign-in failed, the provider’s reason only in Details, and Try again back to where it began', () => {
    const html = signInFailedPage('access_denied: <b>no</b>', '/jobs');
    expect(html).toContain('<h1 class="state-card__title">wechart couldn’t sign you in.</h1>');
    expect(html).toContain('<summary>Details</summary>');
    // The reason as text, never as markup.
    expect(html).toContain(
      '<pre class="state-card__code">access_denied: &lt;b&gt;no&lt;/b&gt;</pre>',
    );
    expect(html).toContain(
      '<a class="btn btn-primary" href="/api/auth/login?returnTo=%2Fjobs">Try again</a>',
    );
  });

  it('D: with no reason kept, no Details, and Try again back to wechart’s home', async () => {
    const html = await page('/sign-in-failed');
    expect(html).toContain('<h1 class="state-card__title">wechart couldn’t sign you in.</h1>');
    expect(html).not.toContain('<details');
    expect(html).toContain(
      '<a class="btn btn-primary" href="/api/auth/login?returnTo=%2F">Try again</a>',
    );
  });
});
