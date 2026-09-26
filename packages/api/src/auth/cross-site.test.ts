import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { pgSessionStore } from './session-store';
import { PUBLIC_URL, signIn, USERS } from './sign-in.fixture';

/**
 * T412 (AC-317): WHERE security is enabled, IF a request that changes
 * something (POST, PUT, PATCH or DELETE) comes from another site, as its
 * `Sec-Fetch-Site: cross-site` header or an `Origin` other than wechart's
 * public address says, THEN THE SYSTEM SHALL refuse it with 403 and change
 * nothing, whatever session cookie it carries.
 * `Fails when: such a request from another site changes something or answers
 * other than 403, or the same request from wechart's own pages is refused.`
 *
 * The session cookie is SameSite=Lax, which already keeps it off another
 * site's POST; this refuses the request whatever it carries (the user's R25;
 * research/openid-client.md, "SPA behaviour and CSRF").
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...base,
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

/** A server whose document store records what it is asked to create. */
function serving(config: typeof base | typeof secured) {
  const created: unknown[] = [];
  const app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: {
      create: async (document: unknown) => {
        created.push(document);
        return { ...(document as object), id: `d-${String(created.length)}`, version: 1 };
      },
    } as never,
  });
  servers.push(app);
  return { app, created };
}

const create = (app: FastifyInstance, headers: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: '/api/documents',
    headers,
    payload: { kind: 'folder', title: 'From somewhere', folderId: 'root' },
  });

describe('a request from another site that would change something (T412, AC-317)', () => {
  it('is refused with 403 and creates nothing, by its Sec-Fetch-Site or its Origin', async () => {
    const { app, created } = serving(secured);
    const cookie = await signIn(app, USERS['writer']!);

    for (const from of [
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'https://elsewhere.example' },
      // Another port of the same host is another origin too.
      { origin: 'http://localhost:9999' },
    ]) {
      const response = await create(app, { cookie, ...from });
      expect(response.statusCode, JSON.stringify(from)).toBe(403);
      expect(response.json(), JSON.stringify(from)).toEqual({
        error: 'A request from another site can’t change anything here.',
      });
    }
    expect(created).toEqual([]);
  });

  it('is refused for every method that changes something, with or without a cookie', async () => {
    const { app } = serving(secured);
    const cookie = await signIn(app, USERS['writer']!);
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/documents/folder/f-1',
        headers: { cookie, 'sec-fetch-site': 'cross-site' },
        ...(method === 'DELETE' ? {} : { payload: {} }),
      });
      expect(response.statusCode, method).toBe(403);
    }
    // Refused as from another site, not asked to sign in: whatever it carries.
    const bare = await create(app, { 'sec-fetch-site': 'cross-site' });
    expect(bare.statusCode).toBe(403);
    // A sandboxed frame's or a redirect's `Origin: null` is no page of wechart's.
    const nulled = await create(app, { cookie, origin: 'null' });
    expect(nulled.statusCode).toBe(403);
  });

  it('can’t sign anyone out either', async () => {
    const { app } = serving(secured);
    const cookie = await signIn(app, USERS['reader']!);
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'sec-fetch-site': 'cross-site' },
    });
    expect(out.statusCode).toBe(403);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });

  it('lets the same request through from wechart’s own pages', async () => {
    const { app, created } = serving(secured);
    const cookie = await signIn(app, USERS['writer']!);
    for (const from of [
      { 'sec-fetch-site': 'same-origin', origin: PUBLIC_URL },
      { origin: PUBLIC_URL },
      // A tool or script sends neither.
      {},
    ]) {
      const response = await create(app, { cookie, ...from });
      expect(response.statusCode, JSON.stringify(from)).toBe(201);
    }
    expect(created).toHaveLength(3);
  });

  it('leaves reading alone: a GET from another site is answered as any other', async () => {
    const { app } = serving(secured);
    const cookie = await signIn(app, USERS['writer']!);
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie, 'sec-fetch-site': 'cross-site', origin: 'https://elsewhere.example' },
    });
    expect(me.statusCode).toBe(200);
  });

  it('refuses nothing with security off', async () => {
    const { app, created } = serving(base);
    const response = await create(app, { 'sec-fetch-site': 'cross-site' });
    expect(response.statusCode).toBe(201);
    expect(created).toHaveLength(1);
  });
});
